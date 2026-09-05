"""Unit tests for configurable model choices."""

from django.test.utils import override_settings

from core import choices, models


def test_user_language_choices_follow_settings_without_changing_migration_state():
    """Language choices should be dynamic while their migration value stays stable."""
    languages = (("zh-cn", "Simplified Chinese"), ("en-us", "English"))
    field = models.User._meta.get_field("language")

    with override_settings(LANGUAGES=languages):
        assert list(field.choices) == list(languages)

    _, _, _, field_options = field.deconstruct()
    assert field_options["choices"] is choices.get_language_choices
