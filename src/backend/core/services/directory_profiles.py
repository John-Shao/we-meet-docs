"""Versioned directory name snapshots for existing Docs identities only."""

from django.db.models import Q
from django.utils import timezone

from rest_framework import serializers

from core import models
from core.validators import sub_validator


class ProfileInput(serializers.Serializer):
    sub = serializers.CharField(max_length=255, validators=[sub_validator])
    full_name = serializers.CharField(max_length=100, allow_blank=True)
    short_name = serializers.CharField(max_length=100, allow_blank=True)


class SnapshotInput(serializers.Serializer):
    observed_at = serializers.DateTimeField()
    users = ProfileInput(many=True, allow_empty=False, max_length=100)

    def validate_users(self, value):
        if len({row["sub"] for row in value}) != len(value):
            raise serializers.ValidationError("Duplicate identities")
        return value


def list_profiles(query):
    """Keyset pagination stays stable when identities are created or deleted."""
    users = models.User.objects.exclude(sub__isnull=True).exclude(sub="").order_by("pk")
    if query.get("cursor"):
        cursor = serializers.UUIDField().run_validation(query["cursor"])
        users = users.filter(pk__gt=cursor)
    rows = list(users.values("pk", "sub")[:101])
    return {
        "subs": [row["sub"] for row in rows[:100]],
        "next_cursor": str(rows[99]["pk"]) if len(rows) > 100 else None,
    }


def sync_profiles(payload):
    serializer = SnapshotInput(data=payload)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data
    results = []
    for row in data["users"]:
        # Conditional UPDATE serializes with User.save's row lock. Older/retried
        # batches cannot roll back a newer snapshot. Missing users are not created.
        users = models.User.objects.filter(sub=row["sub"])
        updated = users.filter(
            Q(meet_profile_synced_at__isnull=True)
            | Q(meet_profile_synced_at__lt=data["observed_at"])
        ).update(
            full_name=row["full_name"] or None,
            short_name=row["short_name"] or None,
            meet_profile_synced_at=data["observed_at"],
            updated_at=timezone.now(),
        )
        status = "updated" if updated else "stale" if users.exists() else "missing"
        results.append({"sub": row["sub"], "status": status})
    return {"results": results}
