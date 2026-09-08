"""Chat grants enforce the actor's abilities and never downgrade access."""

from unittest import mock

import pytest
from rest_framework.test import APIClient

from core import factories, models

pytestmark = pytest.mark.django_db
URL = "/api/v1.0/documents/grant-access-for-users/"


@pytest.fixture
def grant_setup(settings):
    settings.SERVER_TO_SERVER_API_TOKENS = ["chat-test"]
    owner = factories.UserFactory()
    with mock.patch("core.models.Document.save_content"):
        doc = factories.DocumentFactory(users=[(owner, "owner")])
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION="Bearer chat-test")
    return client, doc, owner


@pytest.mark.parametrize(
    "existing,requested,expected",
    [
        ("reader", "editor", "editor"),
        ("commenter", "editor", "editor"),
        ("editor", "reader", "editor"),
        ("administrator", "editor", "administrator"),
        ("owner", "reader", "owner"),
    ],
)
def test_grant_upgrades_but_never_downgrades(
    grant_setup, existing, requested, expected
):
    client, doc, owner = grant_setup
    recipient = factories.UserFactory()
    access = models.DocumentAccess.objects.create(
        document=doc, user=recipient, role=existing
    )
    body = {
        "doc_id": str(doc.id),
        "actor_sub": owner.sub,
        "role": requested,
        "users": [{"sub": recipient.sub, "email": recipient.email}],
    }
    response = client.post(URL, body, format="json")
    assert response.status_code == 200, response.content
    assert response.json()["complete"] is True
    assert response.json()["role"] == requested
    access.refresh_from_db()
    assert access.role == expected
    assert client.post(URL, body, format="json").json()["granted"] == 0


@pytest.mark.parametrize("actor_role", ["reader", "editor", None])
def test_cannot_grant_without_management_ability(grant_setup, actor_role):
    client, doc, _ = grant_setup
    actor, recipient = factories.UserFactory(), factories.UserFactory()
    if actor_role:
        models.DocumentAccess.objects.create(document=doc, user=actor, role=actor_role)
    response = client.post(
        URL,
        {
            "doc_id": str(doc.id),
            "actor_sub": actor.sub,
            "role": "editor",
            "users": [{"sub": recipient.sub, "email": recipient.email}],
        },
        format="json",
    )
    assert response.status_code == 403
    assert not models.DocumentAccess.objects.filter(
        document=doc, user=recipient
    ).exists()


def test_missing_actor_and_invalid_role_are_rejected(grant_setup):
    client, doc, owner = grant_setup
    body = {"doc_id": str(doc.id), "role": "editor", "users": []}
    assert client.post(URL, body, format="json").status_code == 403
    body.update(actor_sub=owner.sub, role="owner")
    assert client.post(URL, body, format="json").status_code == 400


def test_identity_provisioning_and_legacy_default(grant_setup):
    client, doc, owner = grant_setup
    recipient = {"sub": "future-chat-user"}
    body = {"doc_id": str(doc.id), "users": [recipient]}
    assert client.post(URL, body, format="json").json() == {"granted": 1}
    body.update(actor_sub=owner.sub, role="editor")
    assert client.post(URL, body, format="json").json()["complete"] is True
    assert (
        models.DocumentAccess.objects.get(document=doc, user__sub=recipient["sub"]).role
        == "editor"
    )


def test_invalid_recipient_is_not_reported_as_complete(grant_setup):
    client, doc, owner = grant_setup
    response = client.post(
        URL,
        {
            "doc_id": str(doc.id),
            "actor_sub": owner.sub,
            "role": "reader",
            "users": [{"sub": ""}],
        },
        format="json",
    )
    assert response.json()["complete"] is False
