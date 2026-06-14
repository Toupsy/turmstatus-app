from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import require_roles
from ..models import AuditLog, Role, User
from ..schemas import AuditOut

router = APIRouter(prefix="/api/audit", tags=["audit"])


@router.get("", response_model=list[AuditOut])
def list_audit(
    limit: int = 200,
    db: Session = Depends(get_db),
    admin: User = Depends(require_roles(Role.HAUPTWACHE)),
):
    limit = max(1, min(limit, 1000))
    return (
        db.query(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit).all()
    )
