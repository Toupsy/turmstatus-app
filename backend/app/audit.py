from sqlalchemy.orm import Session

from .models import AuditLog, User


def log_action(
    db: Session,
    actor: User | None,
    action: str,
    entity_type: str | None = None,
    entity_id: int | None = None,
    detail: dict | None = None,
) -> AuditLog:
    """Schreibt einen Audit-Eintrag (Wer / Wann / Was).

    Wird innerhalb der aufrufenden Transaktion ausgeführt – der Commit
    erfolgt durch den Aufrufer, damit Aktion und Protokoll atomar sind.
    """
    entry = AuditLog(
        actor_id=actor.id if actor else None,
        actor_name=actor.full_name if actor else "system",
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        detail=detail or {},
    )
    db.add(entry)
    return entry
