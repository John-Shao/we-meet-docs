"""Trusted profile refreshes keep the existing identity and permissions."""

import pytest

from core import factories
from core.services.trusted_users import ensure_trusted_user

pytestmark = pytest.mark.django_db


def test_refresh_names_without_changing_identity_or_other_profile_fields():
    user = factories.UserFactory(full_name="1000", short_name="1000", language="en-us")
    updated = ensure_trusted_user(
        {
            "sub": user.sub,
            "full_name": "John",
            "short_name": "J",
            "email": "different@example.test",
            "language": "fr-fr",
        }
    )
    assert updated.pk == user.pk
    user.refresh_from_db()
    assert user.full_name == "John"
    assert user.short_name == "J"
    assert user.email != "different@example.test"
    assert user.language == "en-us"


@pytest.mark.parametrize(
    "names", [{}, {"full_name": None}, {"full_name": "", "short_name": "  "}]
)
def test_incomplete_names_do_not_erase_profile(names):
    user = factories.UserFactory(full_name="John", short_name="J")
    previous_update = user.updated_at
    ensure_trusted_user({"sub": user.sub, **names})
    user.refresh_from_db()
    assert (user.full_name, user.short_name) == ("John", "J")
    assert user.updated_at == previous_update


def test_same_names_do_not_write_profile():
    user = factories.UserFactory(full_name="John", short_name="J")
    previous_update = user.updated_at
    ensure_trusted_user({"sub": user.sub, "full_name": "John", "short_name": "J"})
    user.refresh_from_db()
    assert user.updated_at == previous_update
