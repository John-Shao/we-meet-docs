"""Conversation grants can downgrade only the permission they contributed."""

from unittest import mock

import pytest
from rest_framework.test import APIClient

from core import factories, models

pytestmark = pytest.mark.django_db
URL = "/api/v1.0/documents/chat-access/"


@pytest.fixture
def share(settings):
    settings.SERVER_TO_SERVER_API_TOKENS = ["test-chat"]
    owner = factories.UserFactory()
    with mock.patch("core.models.Document.save_content"):
        doc = factories.DocumentFactory(users=[(owner, "owner")])
    recipient = factories.UserFactory()
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION="Bearer test-chat")
    body = {
        "doc_id": str(doc.id),
        "actor_sub": owner.sub,
        "cid": "chat-one",
        "users": [{"sub": recipient.sub, "email": recipient.email}],
    }
    return client, body, doc, recipient


@pytest.mark.parametrize(
    "baseline,expected",
    [
        (None, "reader"),
        ("reader", "reader"),
        ("commenter", "commenter"),
        ("editor", "editor"),
        ("administrator", "administrator"),
    ],
)
def test_downgrade_preserves_independent_access(share, baseline, expected):
    client, body, doc, user = share
    if baseline:
        models.DocumentAccess.objects.create(document=doc, user=user, role=baseline)
    assert (
        client.post(URL, {**body, "role": "editor"}, format="json").status_code == 200
    )
    response = client.post(URL, {**body, "role": "reader"}, format="json")
    assert response.json()["complete"] is True
    assert models.DocumentAccess.objects.get(document=doc, user=user).role == expected
    assert client.post(URL, body, format="json").json()["role"] == "reader"


def test_other_chat_grant_is_preserved(share):
    client, body, doc, user = share
    for cid in ("chat-one", "chat-two"):
        assert (
            client.post(
                URL, {**body, "cid": cid, "role": "editor"}, format="json"
            ).status_code
            == 200
        )
    client.post(URL, {**body, "role": "reader"}, format="json")
    assert models.DocumentAccess.objects.get(document=doc, user=user).role == "editor"
    client.post(URL, {**body, "cid": "chat-two", "role": "reader"}, format="json")
    assert models.DocumentAccess.objects.get(document=doc, user=user).role == "reader"


def test_manual_edit_even_same_role_becomes_independent(share):
    client, body, doc, user = share
    client.post(URL, {**body, "role": "editor"}, format="json")
    access = models.DocumentAccess.objects.get(document=doc, user=user)
    access.save(update_fields=["role"])
    client.post(URL, {**body, "role": "reader"}, format="json")
    access.refresh_from_db()
    assert access.role == "editor"


def test_deleted_access_is_not_resurrected_by_reading_card(share):
    client, body, doc, user = share
    client.post(URL, {**body, "role": "editor"}, format="json")
    models.DocumentAccess.objects.filter(document=doc, user=user).delete()
    assert client.post(URL, body, format="json").status_code == 200
    assert not models.DocumentAccess.objects.filter(document=doc, user=user).exists()


def test_invitation_conversion_keeps_sources(share):
    client, body, doc, _ = share
    body["users"] = [{"sub": "new-recipient", "email": "recipient@example.test"}]
    assert (
        client.post(URL, {**body, "role": "editor"}, format="json").status_code == 200
    )
    user = factories.UserFactory(sub="new-recipient", email="recipient@example.test")
    assert models.DocumentAccess.objects.get(document=doc, user=user).chat_permissions
    client.post(URL, {**body, "role": "reader"}, format="json")
    assert models.DocumentAccess.objects.get(document=doc, user=user).role == "reader"


def test_non_manager_can_read_status_but_cannot_grant(share):
    client, body, doc, user = share
    models.DocumentAccess.objects.create(document=doc, user=user, role="editor")
    body["actor_sub"] = user.sub
    assert client.post(URL, body, format="json").json()["can_manage"] is False
    assert (
        client.post(URL, {**body, "role": "reader"}, format="json").status_code == 403
    )


def test_actor_and_role_validated(share):
    client, body, _, _ = share
    assert (
        client.post(URL, {**body, "actor_sub": "unknown"}, format="json").status_code
        == 403
    )
    assert (
        client.post(URL, {**body, "role": "administrator"}, format="json").status_code
        == 400
    )
    assert (
        client.post(URL, {**body, "doc_id": "invalid"}, format="json").status_code
        == 404
    )
    client.credentials()
    assert client.post(URL, body, format="json").status_code in (401, 403)


def test_identity_merge_preserves_combined_rights_as_baseline(share):
    client, body, doc, inactive = share
    client.post(URL, {**body, "role": "editor"}, format="json")
    active = factories.UserFactory()
    models.DocumentAccess.objects.create(document=doc, user=active, role="editor")
    rec = models.UserReconciliation.objects.create(
        active_email=active.email,
        inactive_email=inactive.email,
        active_user=active,
        inactive_user=inactive,
        active_email_checked=True,
        inactive_email_checked=True,
        status="ready",
    )
    with mock.patch("core.models.User.send_email"):
        rec.process_reconciliation_request()
    body["users"] = [{"sub": active.sub, "email": active.email}]
    assert (
        client.post(URL, {**body, "role": "reader"}, format="json").status_code == 200
    )
    assert models.DocumentAccess.objects.get(document=doc, user=active).role == "editor"
