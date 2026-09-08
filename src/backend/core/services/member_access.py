"""Direct member grants, with Meet-authenticated identities and Docs authorization."""

from django.core.exceptions import ValidationError as ModelValidationError
from django.db import IntegrityError, transaction

from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError

from core import models
from core.services.trusted_users import ensure_trusted_user


@transaction.atomic
def member_access(data):
    try:
        document = models.Document.objects.select_for_update().get(
            pk=data.get("doc_id"), ancestors_deleted_at__isnull=True
        )
    except (models.Document.DoesNotExist, ValueError, ModelValidationError) as exc:
        raise NotFound("Document not found") from exc
    actor = models.User.objects.filter(sub=str(data.get("actor_sub") or "")).first()
    if not actor or not document.get_abilities(actor).get("accesses_manage"):
        raise PermissionDenied("Document access management permission required")
    if "role" not in data:
        return {
            "member_subs": list(
                document.accesses.exclude(user__sub__isnull=True).values_list(
                    "user__sub", flat=True
                )
            )
        }
    role, users = data["role"], data.get("users")
    if (
        role not in ("reader", "commenter", "editor")
        or not isinstance(users, list)
        or not 1 <= len(users) <= 100
    ):
        raise ValidationError("role and 1-100 users are required")
    results = []
    for entry in users:
        sub = str(entry.get("sub") or "").strip() if isinstance(entry, dict) else ""
        try:
            with transaction.atomic():
                user = ensure_trusted_user(entry if isinstance(entry, dict) else {})
                _, created = models.DocumentAccess.objects.get_or_create(
                    document=document, user=user, defaults={"role": role}
                )
                results.append(
                    {"sub": sub, "status": "added" if created else "existing"}
                )
        except (ModelValidationError, IntegrityError):
            results.append({"sub": sub, "status": "failed"})
    return {"role": role, "results": results, "identity": "sub"}
