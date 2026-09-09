"""Change one chat's grants without reducing independent document access."""

from django.core.exceptions import ValidationError as ModelValidationError
from django.db import transaction

from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError

from core import models
from core.services.trusted_users import ensure_trusted_user


def apply_chat_role(access, source, role, *, created):
    """The materialized role remains compatible with all existing access queries."""
    metadata = access.chat_permissions
    if metadata.get("applied") != access.role:
        metadata = {"base": None if created else access.role, "sources": {}}
    sources = dict(metadata.get("sources", {}))
    sources[source] = role
    access.role = models.RoleChoices.max(metadata.get("base"), *sources.values())
    access.chat_permissions = {
        "base": metadata.get("base"),
        "sources": sources,
        "applied": access.role,
    }
    access.save(
        chat_grant_update=True, update_fields=["role", "chat_permissions", "updated_at"]
    )


@transaction.atomic
def chat_access(data):
    """S2S endpoint: actor is supplied exclusively by the authenticated Meet server."""
    doc_id, cid, actor_sub = (
        str(data.get(k) or "").strip() for k in ("doc_id", "cid", "actor_sub")
    )
    if not doc_id or not cid or len(cid) > 255 or not actor_sub:
        raise ValidationError("doc_id, cid and actor_sub are required")
    try:
        document = models.Document.objects.select_for_update().get(
            pk=doc_id, ancestors_deleted_at__isnull=True
        )
    except (models.Document.DoesNotExist, ValueError, ModelValidationError) as exc:
        raise NotFound("Document not found") from exc
    actor = models.User.objects.filter(sub=actor_sub).first()
    abilities = document.get_abilities(actor) if actor else {}
    if not abilities.get("retrieve"):
        raise PermissionDenied("Document access required")
    can_manage = abilities.get("accesses_manage", False)
    share = models.DocumentChatShare.objects.filter(
        document=document, actor=actor, cid=cid
    ).first()
    if "role" not in data:
        return {
            "role": share.role if share else None,
            "complete": share.complete if share else False,
            "can_manage": can_manage,
            "scoped": True,
        }
    if not can_manage:
        raise PermissionDenied("Document access management permission required")
    role, users = data["role"], data.get("users")
    if role not in ("reader", "commenter", "editor") or not isinstance(users, list):
        raise ValidationError("reader/commenter/editor role and users[] are required")
    share, _ = models.DocumentChatShare.objects.get_or_create(
        document=document, actor=actor, cid=cid, defaults={"role": role}
    )
    complete = True
    for entry in users:
        if not isinstance(entry, dict) or not str(entry.get("sub") or "").strip():
            complete = False
            continue
        try:
            user = ensure_trusted_user(entry)
        except ModelValidationError:
            complete = False
            continue
        access, created = (
            models.DocumentAccess.objects.select_for_update().get_or_create(
                document=document, user=user, defaults={"role": role}
            )
        )
        apply_chat_role(access, str(share.id), role, created=created)
    share.role, share.complete = role, complete
    share.save(update_fields=["role", "complete", "updated_at"])
    return {"role": role, "complete": complete, "can_manage": True, "scoped": True}
