"""Atomic S2S document creation and read-only recovery after a lost response."""

import hashlib
import json

from django.db import connection, transaction

from rest_framework.exceptions import PermissionDenied

from core import models


def _try_lock(owner_sub, key):
    """Serialize one caller identity/key without waiting behind network conversion."""
    digest = hashlib.sha256(f"document-create:{owner_sub}:{key}".encode()).digest()
    lock_id = int.from_bytes(digest[:8], "big", signed=True)
    with connection.cursor() as cursor:
        cursor.execute("SELECT pg_try_advisory_xact_lock(%s)", [lock_id])
        return cursor.fetchone()[0]


def _result(receipt, *, replayed):
    """A deleted or transferred document must never be silently recreated."""
    document = receipt.document
    if (
        document is None
        or document.ancestors_deleted_at is not None
        or document.deleted_at is not None
        or not document.accesses.filter(
            user__sub=receipt.owner_sub,
            user__is_active=True,
            role=models.RoleChoices.OWNER,
        ).exists()
    ):
        return {"state": "unavailable"}, 410
    return {"state": "ready", "id": str(document.pk), "replayed": replayed}, 200


@transaction.atomic
def create_document_once(serializer, key):
    """Commit document, ownership and receipt together; never notify on this path."""
    data = serializer.validated_data
    owner_sub = data["sub"]
    if not _try_lock(owner_sub, key):
        return {"state": "processing"}, 409
    digest = hashlib.sha256(
        json.dumps(
            data, sort_keys=True, ensure_ascii=False, separators=(",", ":")
        ).encode()
    ).hexdigest()
    receipt = (
        models.ServerDocumentCreation.objects.select_related("document")
        .filter(owner_sub=owner_sub, key=key)
        .first()
    )
    if receipt:
        if receipt.request_hash != digest:
            return {"state": "conflict"}, 409
        return _result(receipt, replayed=True)
    if models.User.objects.filter(sub=owner_sub, is_active=False).exists():
        raise PermissionDenied("The document owner is inactive.")
    serializer.context["suppress_notifications"] = True
    document = serializer.save()
    models.ServerDocumentCreation.objects.create(
        owner_sub=owner_sub,
        key=key,
        request_hash=digest,
        document=document,
    )
    return {"state": "ready", "id": str(document.pk), "replayed": False}, 201


@transaction.atomic
def lookup_document_creation(owner_sub, key):
    """Unknown, in-flight, ready and unavailable are distinct recovery outcomes."""
    if not _try_lock(owner_sub, key):
        return {"state": "processing"}, 202
    receipt = (
        models.ServerDocumentCreation.objects.select_related("document")
        .filter(owner_sub=owner_sub, key=key)
        .first()
    )
    if not receipt:
        return {"state": "not_found"}, 404
    return _result(receipt, replayed=True)
