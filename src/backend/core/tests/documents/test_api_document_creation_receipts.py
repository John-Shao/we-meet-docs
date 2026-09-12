"""Durable document identity, concurrency and recovery without repeated notifications."""

import uuid
from concurrent.futures import ThreadPoolExecutor
from threading import Event
from unittest.mock import patch

from django.core.exceptions import ValidationError
from django.db import close_old_connections
from django.utils import timezone

import pytest
from rest_framework.test import APIClient

from core import factories, models
from core.services.converter_services import ConversionError, Converter

pytestmark = pytest.mark.django_db
CREATE = "/api/v1.0/documents/create-for-owner/"
LOOKUP = "/api/v1.0/documents/create-for-owner-result/"
DATA = {
    "sub": "meeting-owner",
    "title": "Meeting minutes",
    "content": "# Decision\nShip the reviewed change.",
    "email": "owner@example.test",
}
AUTH = {"HTTP_AUTHORIZATION": "Bearer test-creation-token"}


@pytest.fixture(autouse=True)
def isolated(settings):
    settings.SERVER_TO_SERVER_API_TOKENS = ["test-creation-token"]
    with (
        patch.object(Converter, "convert", return_value="converted") as conversion,
        patch.object(models.Document, "save_content") as storage,
        patch.object(models.Document, "send_email") as mail,
        patch("core.api.serializers.posthog_capture"),
    ):
        yield conversion, storage, mail


def create(key, data=None):
    return APIClient().post(
        CREATE, data or DATA, format="json", HTTP_IDEMPOTENCY_KEY=str(key), **AUTH
    )


def lookup(key, sub="meeting-owner"):
    return APIClient().get(LOOKUP, {"sub": sub}, HTTP_IDEMPOTENCY_KEY=str(key), **AUTH)


def test_replay_and_lookup_return_same_document_without_reconversion_or_email(isolated):
    key = uuid.uuid4()
    first = create(key)
    assert first.status_code == 201, first.data
    assert first.data["state"] == "ready" and first.data["replayed"] is False
    repeated = create(key)
    result = lookup(key)
    assert repeated.status_code == result.status_code == 200
    assert (
        repeated.data
        == result.data
        == {"id": first.data["id"], "state": "ready", "replayed": True}
    )
    assert (
        models.Document.objects.count()
        == models.ServerDocumentCreation.objects.count()
        == 1
    )
    receipt = models.ServerDocumentCreation.objects.get()
    assert len(receipt.request_hash) == 64
    receipt.request_hash = "0" * 64
    with pytest.raises(ValidationError):
        receipt.save()
    assert isolated[0].call_count == 1
    assert isolated[1].call_count == 1
    isolated[2].assert_not_called()
    assert result["Cache-Control"] == "private, no-store"


def test_payload_conflicts_and_owner_scoping_never_rewrite_original(isolated):
    key = uuid.uuid4()
    first = create(key)
    for field in ("title", "content", "email"):
        changed = {
            **DATA,
            field: "different@example.test" if field == "email" else "changed",
        }
        assert create(key, changed).status_code == 409
    assert lookup(key, sub="another-owner").status_code == 404
    assert models.Document.objects.get().pk == uuid.UUID(first.data["id"])
    assert isolated[0].call_count == 1


def test_missing_invalid_auth_keys_and_bounds_create_nothing():
    for path, method in ((CREATE, "post"), (LOOKUP, "get")):
        request = getattr(APIClient(), method)
        assert request(path, DATA, format="json").status_code == 401
        assert (
            request(
                path, DATA, format="json", HTTP_AUTHORIZATION="Bearer invalid"
            ).status_code
            == 401
        )
    for key in ("", "bad-key"):
        assert create(key).status_code == 400
    for data in (
        {**DATA, "other": True},
        {**DATA, "content": "a" * 1000001},
        {**DATA, "title": "a" * 256},
    ):
        assert create(uuid.uuid4(), data).status_code == 400
    assert lookup(uuid.uuid4()).data == {"state": "not_found"}
    assert not models.Document.objects.exists()
    assert not models.User.objects.filter(sub=DATA["sub"]).exists()


def test_failed_conversion_and_storage_roll_back_without_success_receipt(isolated):
    key = uuid.uuid4()
    isolated[0].side_effect = ConversionError("test failure")
    assert create(key).status_code == 400
    assert lookup(key).status_code == 404
    assert not models.Document.objects.exists()
    isolated[0].side_effect = None
    isolated[1].side_effect = RuntimeError("storage test failure")
    with pytest.raises(RuntimeError, match="storage test failure"):
        create(key)
    assert not models.Document.objects.exists()
    assert not models.ServerDocumentCreation.objects.exists()
    isolated[1].side_effect = None
    assert create(key).status_code == 201
    assert models.Document.objects.count() == 1
    isolated[2].assert_not_called()


def test_deleted_or_transferred_document_cannot_be_recreated_with_old_key():
    key = uuid.uuid4()
    create(key)
    document = models.Document.objects.get()
    models.Document.objects.filter(pk=document.pk).update(deleted_at=timezone.now())
    assert lookup(key).status_code == create(key).status_code == 410
    models.Document.objects.filter(pk=document.pk).update(deleted_at=None)
    models.DocumentAccess.objects.filter(document=document).update(
        role=models.RoleChoices.READER
    )
    assert lookup(key).status_code == create(key).status_code == 410
    # Same tombstone shape as FK SET_NULL when the document is physically deleted.
    models.ServerDocumentCreation.objects.update(document=None)
    assert lookup(key).status_code == create(key).status_code == 410
    assert models.Document.objects.count() == 1


def test_inactive_owner_cannot_receive_a_new_keyed_document():
    factories.UserFactory(sub=DATA["sub"], is_active=False)
    assert create(uuid.uuid4()).status_code == 403
    assert not models.Document.objects.exists()


def test_legacy_call_without_key_retains_original_response_and_notification(isolated):
    response = APIClient().post(CREATE, DATA, format="json", **AUTH)
    assert response.status_code == 201
    assert response.data == {"id": str(models.Document.objects.get().pk)}
    isolated[2].assert_called_once()
    assert not models.ServerDocumentCreation.objects.exists()


@pytest.mark.django_db(transaction=True)
def test_two_workers_and_lookup_report_inflight_without_creating_a_duplicate(isolated):
    key = uuid.uuid4()
    entered, release = Event(), Event()

    def conversion(*_args):
        entered.set()
        assert release.wait(10)
        return "converted"

    def worker():
        close_old_connections()
        try:
            return create(key)
        finally:
            close_old_connections()

    isolated[0].side_effect = conversion
    with ThreadPoolExecutor(max_workers=1) as pool:
        future = pool.submit(worker)
        try:
            assert entered.wait(5)
            assert create(key).status_code == 409
            pending = lookup(key)
            assert pending.status_code == 202 and pending.data["state"] == "processing"
        finally:
            release.set()
        first = future.result(timeout=10)
    assert first.status_code == 201
    assert create(key).data["id"] == first.data["id"]
    assert models.Document.objects.count() == 1
    assert isolated[0].call_count == 1
