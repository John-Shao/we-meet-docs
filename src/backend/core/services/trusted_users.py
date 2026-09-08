"""Provision identities asserted by the authenticated Meet server, never by email."""

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction

from core import models
from core.validators import sub_validator


def _sync_names(user, data):
    """Refresh names from Meet; incomplete payloads must not erase existing names."""
    changed = []
    for field in ("full_name", "short_name"):
        value = str(data.get(field) or "").strip()[:100]
        if value and value != getattr(user, field):
            setattr(user, field, value)
            changed.append(field)
    if changed:
        user.save(update_fields=[*changed, "updated_at"])
    return user


def ensure_trusted_user(data):
    """Email is optional profile data, not an account lookup or provisioning requirement."""
    sub = str(data.get("sub") or "").strip()
    if not sub or len(sub) > 255:
        raise ValidationError("A valid sub is required")
    sub_validator(sub)
    user = models.User.objects.filter(sub=sub).first()
    if user:
        return _sync_names(user, data)
    try:
        with transaction.atomic():
            return models.User.objects.create(
                sub=sub,
                password="!",  # noqa: S106 - no password login for a trusted identity
                full_name=str(data.get("full_name") or "")[:100] or None,
                short_name=str(data.get("short_name") or "")[:100] or None,
                # No email-based invitation reconciliation or account merging.
                email=None,
                language=data.get("language")
                if data.get("language") in dict(settings.LANGUAGES)
                else None,
            )
    except (IntegrityError, ValidationError):
        user = models.User.objects.filter(sub=sub).first()
        if user:
            return _sync_names(user, data)
        raise
