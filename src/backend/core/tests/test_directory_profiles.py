"""Authoritative name snapshots are shared by every Docs surface."""

from datetime import timedelta

from django.utils import timezone

import pytest
from rest_framework.test import APIClient

from core import factories, models
from core.api.serializers import UserLightSerializer, UserSerializer
from core.services.trusted_users import ensure_trusted_user

pytestmark = pytest.mark.django_db
URL = "/api/v1.0/users/directory-profiles/"


@pytest.fixture
def client(settings):
    settings.SERVER_TO_SERVER_API_TOKENS = ["test-profiles"]
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION="Bearer test-profiles")
    return client


def snapshot(user, at=None, full_name="John", short_name="J"):
    return {
        "observed_at": (at or timezone.now()).isoformat(),
        "users": [{"sub": user.sub, "full_name": full_name, "short_name": short_name}],
    }


def test_sync_existing_identity_without_invite_or_login(client):
    user = factories.UserFactory(full_name="1000", short_name="1000", email=None)
    assert client.get(URL).json()["subs"] == [user.sub]
    payload = snapshot(user)
    assert (
        client.post(URL, payload, format="json").json()["results"][0]["status"]
        == "updated"
    )
    user.refresh_from_db()
    for serializer in (UserSerializer, UserLightSerializer):
        assert serializer(user).data["full_name"] == "John"
        assert serializer(user).data["short_name"] == "J"
    assert user.email is None
    assert not models.DocumentAccess.objects.filter(user=user).exists()


@pytest.mark.parametrize("full_save", [False, True])
def test_stale_login_object_cannot_undo_sync(client, full_save):
    user = factories.UserFactory(full_name="1000", short_name="1000")
    stale = models.User.objects.get(pk=user.pk)
    payload = snapshot(user)
    client.post(URL, payload, format="json")
    stale.full_name = "1000"
    stale.short_name = "1000"
    stale.language = "fr-fr"
    stale.save(
        **(
            {}
            if full_save
            else {"update_fields": ["full_name", "short_name", "language"]}
        )
    )
    user.refresh_from_db()
    assert (user.full_name, user.short_name) == ("John", "J")
    assert user.language == "fr-fr"
    assert user.meet_profile_synced_at is not None
    # Legacy invite, summary and session paths all use this helper.
    ensure_trusted_user({"sub": user.sub, "full_name": "1000"})
    user.refresh_from_db()
    assert user.full_name == "John"


def test_out_of_order_and_duplicate_snapshots_do_not_roll_back(client):
    user = factories.UserFactory(full_name="1000")
    now = timezone.now()
    new = snapshot(user, now)
    assert client.post(URL, new, format="json").status_code == 200
    old = snapshot(user, now - timedelta(seconds=60), full_name="1000")
    for payload in (old, new):
        assert (
            client.post(URL, payload, format="json").json()["results"][0]["status"]
            == "stale"
        )
    user.refresh_from_db()
    assert user.full_name == "John"


def test_explicit_clear_is_authoritative_but_incomplete_payload_is_rejected(client):
    user = factories.UserFactory(full_name="1000", short_name="1000", email=None)
    payload = snapshot(user, full_name="", short_name="")
    assert client.post(URL, payload, format="json").status_code == 200
    user.refresh_from_db()
    assert user.full_name is None and user.short_name is None
    del payload["users"][0]["short_name"]
    assert client.post(URL, payload, format="json").status_code == 400


def test_sync_does_not_provision_or_merge_unknown_identity(client):
    user = factories.UserFactory()
    payload = snapshot(user)
    payload["users"][0]["sub"] = "unprovisioned"
    assert (
        client.post(URL, payload, format="json").json()["results"][0]["status"]
        == "missing"
    )
    assert not models.User.objects.filter(sub="unprovisioned").exists()


def test_service_auth_required_for_reads_and_writes(client):
    user = factories.UserFactory()
    client.credentials()
    client.force_login(user)
    assert client.get(URL).status_code == 401
    assert client.post(URL, snapshot(user), format="json").status_code == 401


def test_identity_pagination_and_invalid_cursor(client):
    users = factories.UserFactory.create_batch(101)
    first = client.get(URL).json()
    assert len(first["subs"]) == 100
    second = client.get(URL, {"cursor": first["next_cursor"]}).json()
    assert len(second["subs"]) == 1 and second["next_cursor"] is None
    assert set(first["subs"] + second["subs"]) == {user.sub for user in users}
    assert client.get(URL, {"cursor": "invalid"}).status_code == 400
