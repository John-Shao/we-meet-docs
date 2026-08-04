"""
Tests for the we-meet session bootstrap: mint a one-shot ticket (server-to-server)
and trade it for a Docs session — see core/api/session_bootstrap.py.
"""

from django.core.cache import cache
from django.test import override_settings

import pytest
from rest_framework.test import APIClient

from core import factories
from core.api import session_bootstrap
from core.models import Document, DocumentAccess, Invitation, RoleChoices, User

pytestmark = pytest.mark.django_db

TICKET_URL = "/api/v1.0/users/session-ticket/"
REDEEM_URL = "/api/v1.0/session-from-ticket/"


@pytest.fixture(autouse=True)
def _clear_cache():
    """Tickets live in the cache; keep tests independent."""
    cache.clear()
    yield
    cache.clear()


def _mint(client, **payload):
    """Mint a ticket through the s2s endpoint and return the response."""
    return client.post(
        TICKET_URL,
        {"sub": "user-sub", **payload},
        format="json",
        HTTP_AUTHORIZATION="Bearer DummyToken",
    )


def test_api_session_ticket_missing_token():
    """Minting a ticket without the s2s token is refused."""
    response = APIClient().post(TICKET_URL, {"sub": "user-sub"}, format="json")

    assert response.status_code == 401


@override_settings(SERVER_TO_SERVER_API_TOKENS=["DummyToken"])
def test_api_session_ticket_invalid_token():
    """Minting a ticket with an unknown s2s token is refused."""
    response = APIClient().post(
        TICKET_URL,
        {"sub": "user-sub"},
        format="json",
        HTTP_AUTHORIZATION="Bearer WrongToken",
    )

    assert response.status_code == 401


@override_settings(SERVER_TO_SERVER_API_TOKENS=["DummyToken"])
def test_api_session_ticket_requires_sub():
    """A ticket is meaningless without the identity it stands for."""
    response = _mint(APIClient(), sub="")

    assert response.status_code == 400


@override_settings(SERVER_TO_SERVER_API_TOKENS=["DummyToken"])
def test_api_session_ticket_then_redeem_logs_the_user_in():
    """The happy path: an existing user gets a Docs session with no OIDC round-trip."""
    user = factories.UserFactory(sub="user-sub")
    client = APIClient()

    response = _mint(client, email=user.email)
    assert response.status_code == 200
    ticket = response.json()["ticket"]
    assert response.json()["expires_in"] == session_bootstrap.TICKET_TTL_SECONDS

    response = APIClient().get(f"{REDEEM_URL}?ticket={ticket}&next=/docs/")
    assert response.status_code == 302
    assert response["Location"] == "/docs/"
    assert response.wsgi_request.user == user


@override_settings(SERVER_TO_SERVER_API_TOKENS=["DummyToken"])
def test_api_session_from_ticket_is_single_use():
    """A replayed ticket is refused — it falls back to the OIDC entry point."""
    factories.UserFactory(sub="user-sub")
    ticket = _mint(APIClient()).json()["ticket"]

    assert APIClient().get(f"{REDEEM_URL}?ticket={ticket}").status_code == 302

    response = APIClient().get(f"{REDEEM_URL}?ticket={ticket}")
    assert response.status_code == 302
    assert response["Location"].startswith("/api/v1.0/authenticate/")
    assert response.wsgi_request.user.is_anonymous


def test_api_session_from_ticket_unknown_ticket():
    """An unknown ticket never authenticates anyone."""
    response = APIClient().get(f"{REDEEM_URL}?ticket=nope&next=/docs/")

    assert response.status_code == 302
    assert response["Location"] == "/api/v1.0/authenticate/?next=%2Fdocs%2F"
    assert response.wsgi_request.user.is_anonymous


@override_settings(SERVER_TO_SERVER_API_TOKENS=["DummyToken"])
def test_api_session_from_ticket_rejects_external_next():
    """`next` is confined to this site — no open redirect through the bootstrap."""
    factories.UserFactory(sub="user-sub")
    ticket = _mint(APIClient()).json()["ticket"]

    response = APIClient().get(f"{REDEEM_URL}?ticket={ticket}&next=https://evil.test/")

    assert response.status_code == 302
    assert response["Location"] == "/"


@override_settings(SERVER_TO_SERVER_API_TOKENS=["DummyToken"])
def test_api_session_from_ticket_creates_the_user_and_converts_invitations():
    """A user who never logged into Docs is provisioned, invitations included.

    Mirrors first OIDC login: `User.save()` turns pending invitations into
    accesses, so a doc shared to them through we-meet is visible right away.
    """
    # add_root 而非 DocumentFactory:工厂会连带把 content 写进对象存储,这条用例
    # 只关心「新用户 + 待生效邀请」,不需要正文,也就不该依赖 S3。
    document = Document.add_root(title="Shared doc")
    Invitation.objects.create(
        document=document, email="newcomer@example.com", role=RoleChoices.READER
    )
    ticket = _mint(
        APIClient(),
        sub="fresh-sub",
        email="newcomer@example.com",
        full_name="New Comer",
    ).json()["ticket"]

    response = APIClient().get(f"{REDEEM_URL}?ticket={ticket}")

    assert response.status_code == 302
    user = User.objects.get(sub="fresh-sub")
    assert user.email == "newcomer@example.com"
    assert user.full_name == "New Comer"
    assert response.wsgi_request.user == user
    assert DocumentAccess.objects.filter(
        user=user, document=document, role=RoleChoices.READER
    ).exists()
    assert Document.objects.filter(pk=document.pk).exists()


@override_settings(SERVER_TO_SERVER_API_TOKENS=["DummyToken"])
def test_api_session_from_ticket_keeps_existing_profile():
    """An existing Docs profile wins over whatever display name we-meet sent."""
    user = factories.UserFactory(sub="user-sub", full_name="Docs Name")
    ticket = _mint(APIClient(), full_name="Meet Name", email=user.email).json()[
        "ticket"
    ]

    APIClient().get(f"{REDEEM_URL}?ticket={ticket}")

    user.refresh_from_db()
    assert user.full_name == "Docs Name"


def test_session_bootstrap_ticket_is_not_stored_in_clear():
    """The cache holds a digest — a leaked cache dump can't be replayed."""
    ticket = session_bootstrap.mint_ticket({"sub": "user-sub"})

    assert cache.get(f"{session_bootstrap.CACHE_KEY_PREFIX}{ticket}") is None
    assert session_bootstrap.consume_ticket(ticket) == {"sub": "user-sub"}
