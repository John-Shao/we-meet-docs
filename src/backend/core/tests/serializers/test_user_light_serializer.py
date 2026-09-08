"""Test user light serializer."""

import pytest

from core import factories
from core.api.serializers import UserLightSerializer, UserSerializer

pytestmark = pytest.mark.django_db


def test_user_light_serializer():
    """Test user light serializer."""
    user = factories.UserFactory(
        email="test@test.com",
        full_name="John Doe",
        short_name="John",
    )
    serializer = UserLightSerializer(user)
    assert serializer.data["full_name"] == "John Doe"
    assert serializer.data["short_name"] == "John"


def test_user_light_serializer_no_full_name():
    """Test user light serializer without full name."""
    user = factories.UserFactory(
        email="test_foo@test.com",
        full_name=None,
        short_name="John",
    )
    serializer = UserLightSerializer(user)
    assert serializer.data["full_name"] == "test_foo"
    assert serializer.data["short_name"] == "John"


def test_user_light_serializer_no_short_name():
    """Test user light serializer without short name."""
    user = factories.UserFactory(
        email="test_foo@test.com",
        full_name=None,
        short_name=None,
    )
    serializer = UserLightSerializer(user)
    assert serializer.data["full_name"] == "test_foo"
    assert serializer.data["short_name"] == "test_foo"


@pytest.mark.parametrize("serializer_class", [UserSerializer, UserLightSerializer])
@pytest.mark.parametrize("email", [None, ""])
@pytest.mark.parametrize(
    "full_name,short_name,expected",
    [("Phone User", None, "Phone User"), (None, "Phone", "Phone"), (None, None, None)],
)
def test_user_serializer_without_email(
    serializer_class, email, full_name, short_name, expected
):
    """Both member and limited user responses support incomplete phone-only profiles."""
    user = factories.UserFactory.build(
        email=email, full_name=full_name, short_name=short_name
    )
    data = serializer_class(user).data
    assert data["full_name"]
    assert data["short_name"]
    if expected:
        assert data["full_name"] == expected
        assert data["short_name"] == expected
    assert "sub" not in data
