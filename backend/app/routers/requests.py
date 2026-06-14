from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..audit import log_action
from ..database import get_db
from ..deps import get_current_user, require_roles
from ..models import (
    Guard,
    GuardStatus,
    MinusOneRequest,
    RequestStatus,
    Role,
    User,
    utcnow,
)
from ..schemas import MinusOneCreate, RejectBody, RequestOut
from ..ws import notify

router = APIRouter(prefix="/api/requests", tags=["requests"])


def serialize(req: MinusOneRequest, db: Session) -> RequestOut:
    guard = db.get(Guard, req.guard_id)
    out = RequestOut.model_validate(req)
    if guard:
        out.guard_name = guard.name
        out.tower_id = guard.tower_id
    return out


@router.get("", response_model=list[RequestOut])
def list_requests(
    status: RequestStatus | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = db.query(MinusOneRequest)
    if status:
        q = q.filter(MinusOneRequest.status == status)
    # Wachgänger sehen nur eigene Anfragen.
    if user.role == Role.WACHGAENGER:
        q = q.filter(MinusOneRequest.requested_by == user.id)
    elif user.role == Role.TURMFUEHRER:
        tower_guard_ids = [
            g.id for g in db.query(Guard).filter(Guard.tower_id == user.tower_id).all()
        ]
        q = q.filter(MinusOneRequest.guard_id.in_(tower_guard_ids or [-1]))
    reqs = q.order_by(MinusOneRequest.created_at.desc()).all()
    return [serialize(r, db) for r in reqs]


@router.post("/minus-one", response_model=RequestOut, status_code=201)
def request_minus_one(
    body: MinusOneCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    guard = db.get(Guard, body.guard_id)
    if not guard:
        raise HTTPException(404, "Wachgänger nicht gefunden")
    # Wachgänger darf nur für sich selbst beantragen.
    if user.role == Role.WACHGAENGER and guard.user_id != user.id:
        raise HTTPException(403, "Nur für eigenen Wachgänger möglich")

    existing = (
        db.query(MinusOneRequest)
        .filter(
            MinusOneRequest.guard_id == guard.id,
            MinusOneRequest.status.in_([RequestStatus.PENDING, RequestStatus.APPROVED]),
        )
        .first()
    )
    if existing:
        raise HTTPException(409, "Es existiert bereits eine offene/aktive -1 Anfrage")

    req = MinusOneRequest(
        guard_id=guard.id,
        requested_by=user.id,
        reason=body.reason,
        note=body.note,
        status=RequestStatus.PENDING,
    )
    db.add(req)
    db.flush()
    log_action(db, user, "MINUS_ONE_REQUESTED", "request", req.id,
               {"guard": guard.name, "reason": body.reason.value})
    db.commit()
    db.refresh(req)
    notify("requests_changed", {"id": req.id, "status": "PENDING"})
    return serialize(req, db)


@router.post("/{request_id}/approve", response_model=RequestOut)
def approve(
    request_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(Role.HAUPTWACHE)),
):
    req = db.get(MinusOneRequest, request_id)
    if not req:
        raise HTTPException(404, "Anfrage nicht gefunden")
    if req.status != RequestStatus.PENDING:
        raise HTTPException(409, "Anfrage ist nicht mehr offen")

    req.status = RequestStatus.APPROVED
    req.decided_at = utcnow()
    req.decided_by = user.id
    guard = db.get(Guard, req.guard_id)
    if guard:
        guard.status = GuardStatus.MINUS_ONE
    log_action(db, user, "MINUS_ONE_APPROVED", "request", req.id)
    db.commit()
    db.refresh(req)
    notify("requests_changed", {"id": req.id, "status": "APPROVED"})
    notify("guards_changed", {"id": req.guard_id})
    return serialize(req, db)


@router.post("/{request_id}/reject", response_model=RequestOut)
def reject(
    request_id: int,
    body: RejectBody,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(Role.HAUPTWACHE)),
):
    req = db.get(MinusOneRequest, request_id)
    if not req:
        raise HTTPException(404, "Anfrage nicht gefunden")
    if req.status != RequestStatus.PENDING:
        raise HTTPException(409, "Anfrage ist nicht mehr offen")

    req.status = RequestStatus.REJECTED
    req.decided_at = utcnow()
    req.decided_by = user.id
    req.rejection_reason = body.rejection_reason
    log_action(db, user, "MINUS_ONE_REJECTED", "request", req.id,
               {"reason": body.rejection_reason})
    db.commit()
    db.refresh(req)
    notify("requests_changed", {"id": req.id, "status": "REJECTED"})
    return serialize(req, db)


@router.post("/{request_id}/return", response_model=RequestOut)
def return_to_area(
    request_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    req = db.get(MinusOneRequest, request_id)
    if not req:
        raise HTTPException(404, "Anfrage nicht gefunden")
    if user.role == Role.WACHGAENGER and req.requested_by != user.id:
        raise HTTPException(403, "Nur eigene Rückkehr meldbar")
    if req.status != RequestStatus.APPROVED:
        raise HTTPException(409, "Nur eine aktive -1 kann zurückgemeldet werden")

    req.status = RequestStatus.RETURNED
    req.returned_at = utcnow()
    guard = db.get(Guard, req.guard_id)
    if guard:
        guard.status = GuardStatus.IN_AREA
    log_action(db, user, "MINUS_ONE_RETURNED", "request", req.id)
    db.commit()
    db.refresh(req)
    notify("requests_changed", {"id": req.id, "status": "RETURNED"})
    notify("guards_changed", {"id": req.guard_id})
    return serialize(req, db)
