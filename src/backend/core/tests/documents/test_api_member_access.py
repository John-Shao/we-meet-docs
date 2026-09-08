"""Phone-only identities work before their first Docs login."""

from unittest import mock

from django.core import mail

import pytest
from rest_framework.test import APIClient

from core import factories, models
from core.api.session_bootstrap import _resolve_user
from core.authentication.backends import OIDCAuthenticationBackend
from core.factories import DocumentFactory, UserFactory
from core.models import DocumentAccess, DocumentAskForAccess
from core.services.trusted_users import ensure_trusted_user

pytestmark = pytest.mark.django_db
URL = "/api/v1.0/documents/member-access/"


@pytest.fixture
def setup(settings):
    settings.SERVER_TO_SERVER_API_TOKENS = ["test-identity"]
    owner = factories.UserFactory(email=None)
    with mock.patch("core.models.Document.save_content"):
        doc = factories.DocumentFactory(users=[(owner, "owner")])
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION="Bearer test-identity")
    return client, doc, owner


@pytest.mark.parametrize("full_name", ["Phone User", ""])
def test_new_member_is_visible_before_first_login(setup, full_name):
    """Grant success must be followed by a readable membership list, without email."""
    client, doc, owner = setup
    response = client.post(
        URL,
        {
            "doc_id": str(doc.id),
            "actor_sub": owner.sub,
            "role": "reader",
            "users": [{"sub": "new-phone-member", "full_name": full_name}],
        },
        format="json",
    )
    assert response.status_code == 200
    assert response.json()["results"][0]["status"] == "added"
    member = models.User.objects.get(sub="new-phone-member")
    assert member.email is None
    assert member.short_name is None

    client.credentials()
    client.force_login(owner)
    response = client.get(f"/api/v1.0/documents/{doc.id}/accesses/")
    assert response.status_code == 200
    row = next(row for row in response.json() if row["user"]["id"] == str(member.id))
    assert row["role"] == "reader"
    assert row["user"]["full_name"]
    assert row["user"]["short_name"]
    if full_name:
        assert row["user"]["full_name"] == full_name
        assert row["user"]["short_name"] == full_name


@pytest.mark.parametrize("role", ["reader", "commenter", "editor"])
def test_no_email_grant_login_and_retry(setup, role):
    client, doc, owner = setup
    body = {
        "doc_id": str(doc.id),
        "actor_sub": owner.sub,
        "role": role,
        "users": [{"sub": "phone-only", "full_name": "Phone User"}],
    }
    response = client.post(URL, body, format="json")
    assert response.status_code == 200, response.content
    assert response.json()["results"] == [{"sub": "phone-only", "status": "added"}]
    user = models.User.objects.get(sub="phone-only")
    assert user.email is None
    assert models.DocumentAccess.objects.get(document=doc, user=user).role == role
    assert not models.Invitation.objects.filter(document=doc).exists()
    assert _resolve_user({"sub": "phone-only"}).id == user.id
    body["role"] = "reader"
    assert (
        client.post(URL, body, format="json").json()["results"][0]["status"]
        == "existing"
    )
    assert models.DocumentAccess.objects.get(document=doc, user=user).role == role
    roster = client.post(
        URL, {"doc_id": str(doc.id), "actor_sub": owner.sub}, format="json"
    )
    assert user.sub in roster.json()["member_subs"]


def test_same_email_does_not_merge_identities(setup):
    _, doc, owner = setup
    victim = factories.UserFactory(email="same@example.test")
    user = ensure_trusted_user({"sub": "different", "email": victim.email})
    assert user.id != victim.id
    assert user.email is None
    assert ensure_trusted_user({"sub": owner.sub, "email": victim.email}).id == owner.id
    assert not models.DocumentAccess.objects.filter(document=doc, user=victim).exists()


def test_web_login_reuses_provisioned_identity_without_email(settings):
    """OIDC login and native ticket login agree on the same no-email account."""

    settings.SIGNUP_NEW_USER_TO_MARKETING_EMAIL = True
    user = ensure_trusted_user({"sub": "phone-web-user"})
    backend = OIDCAuthenticationBackend()
    with (
        mock.patch.object(backend, "get_userinfo", return_value={"sub": user.sub}),
        mock.patch(
            "core.authentication.backends.create_or_update_contact.delay"
        ) as contact,
    ):
        logged_in = backend.get_or_create_user("test", None, None)
        backend.post_get_or_create_user(user, {}, True)
    assert logged_in.pk == user.pk
    assert logged_in.email is None
    contact.assert_not_called()


@pytest.mark.parametrize("actor_role", ["reader", "editor", None])
def test_non_manager_cannot_provision_or_grant(setup, actor_role):
    client, doc, _ = setup
    actor = factories.UserFactory(email=None)
    if actor_role:
        models.DocumentAccess.objects.create(document=doc, user=actor, role=actor_role)
    body = {
        "doc_id": str(doc.id),
        "actor_sub": actor.sub,
        "role": "reader",
        "users": [{"sub": "new"}],
    }
    assert client.post(URL, body, format="json").status_code == 403
    assert not models.User.objects.filter(sub="new").exists()


def test_normal_session_cannot_call_trusted_endpoint(setup):
    client, doc, owner = setup
    client.credentials()
    client.force_login(owner)
    assert client.post(
        URL, {"doc_id": str(doc.id), "actor_sub": owner.sub}, format="json"
    ).status_code in (401, 403)


def test_invalid_identity_is_reported_without_blocking_valid_recipients(setup):
    client, doc, owner = setup
    response = client.post(
        URL,
        {
            "doc_id": str(doc.id),
            "actor_sub": owner.sub,
            "role": "reader",
            "users": [{"sub": ""}, {"sub": "valid"}],
        },
        format="json",
    )
    assert [row["status"] for row in response.json()["results"]] == ["failed", "added"]


@pytest.mark.parametrize(
    "path,payload",
    [
        ("create-for-owner", {"title": "Phone note", "content": "test"}),
        (
            "create-table-for-owner",
            {"title": "Phone table", "columns": ["A"], "rows": [["1"]]},
        ),
    ],
)
def test_automatically_created_documents_do_not_require_email(setup, path, payload):
    client, _, _ = setup
    with (
        mock.patch("core.api.serializers.Converter.convert", return_value="test"),
        mock.patch("core.models.Document.save_content"),
    ):
        response = client.post(
            f"/api/v1.0/documents/{path}/",
            {**payload, "sub": "phone-owner"},
            format="json",
        )
    assert response.status_code == 201, response.content
    user = models.User.objects.get(sub="phone-owner")
    assert user.email is None
    assert models.DocumentAccess.objects.filter(user=user, role="owner").exists()


@pytest.mark.parametrize("approve", [True, False])
def test_access_request_can_be_processed_without_email(approve):
    """Both parties can complete request/approval in the app, without email delivery."""

    owner = UserFactory(email=None)
    requester = UserFactory(email=None)
    document = DocumentFactory(users=[(owner, "owner")])
    url = f"/api/v1.0/documents/{document.id}/ask-for-access/"
    client = APIClient()
    client.force_login(requester)
    assert client.post(url, {"role": "reader"}, format="json").status_code == 201
    assert len(mail.outbox) == 0
    request = DocumentAskForAccess.objects.get(document=document, user=requester)
    client.force_login(owner)
    response = client.get(url)
    assert response.status_code == 200
    row = response.json()["results"][0]
    assert row["user"]["id"] == str(requester.id)
    assert row["abilities"]["accept"] is True
    if approve:
        response = client.post(
            f"{url}{request.id}/accept/", {"role": "editor"}, format="json"
        )
        assert response.status_code == 204
        assert (
            DocumentAccess.objects.get(document=document, user=requester).role
            == "editor"
        )
    else:
        assert client.delete(f"{url}{request.id}/").status_code == 204
        assert not DocumentAccess.objects.filter(
            document=document, user=requester
        ).exists()
    assert not DocumentAskForAccess.objects.filter(pk=request.id).exists()
    assert len(mail.outbox) == 0
