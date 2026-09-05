from typing import Optional

from ..models.domain import AuditLog
from ..repositories.registry import audit_repo


async def record(
    actor,
    action: str,
    entity: str,
    entity_id: Optional[str] = None,
    tournament_id: Optional[str] = None,
    before: Optional[dict] = None,
    after: Optional[dict] = None,
    reason: Optional[str] = None,
    ip: Optional[str] = None,
):
    """Append-only: audit_logs never receives update/delete calls."""
    log = AuditLog(
        tournament_id=tournament_id,
        actor_id=actor.id if actor else None,
        actor_email=actor.email if actor else "system",
        actor_role=actor.role if actor else "system",
        action=action,
        entity=entity,
        entity_id=entity_id,
        before=before,
        after=after,
        reason=reason,
        ip=ip,
    )
    await audit_repo.insert(log, actor.id if actor else None)
