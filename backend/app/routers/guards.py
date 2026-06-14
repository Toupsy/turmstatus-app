from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..audit import log_action
from ..database import get_db
from ..deps import get_current_user
from ..models import Guard, Role, User
from ..schemas import GuardOut, GuardStatusUpdate, PositionUpdate
from ..ws import notify

router = APIRouter(prefix="/api/guards", tags=["guards"])


def _visible(query, user: User):
    if user.role == Role.HAUPTWACHE:
        return query
    if user.role == Role.TURMFUEHRER:
        return query.filter(Guard.tower_id == user.tower_id)
    return query.filter(Guard.user_id == user.id)


@router.get("", response_model=list[GuardOut])
def list_guards(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return _visible(db.query(Guard), user).order_by(Guard.name).all()


@router.get("/me", response_model=GuardOut)
def my_guard(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    guard = db.query(Guard).filter(Guard.user_id == user.id).first()
    if not guard:
        raise HTTPException(404, "Kein Wachgänger-Profil verknüpft")
    return guard


@router.patch("/{guard_id}/status", response_model=GuardOut)
def set_status(
    guard_id: int,
    body: GuardStatusUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    guard = db.get(Guard, guard_id)
    if not guard:
        raise HTTPException(404, "Wachgänger nicht gefunden")
    if user.role == Role.WACHGAENGER and guard.user_id != user.id:
        raise HTTPException(403, "Nur eigener Status änderbar")
    if user.role == Role.TURMFUEHRER and guard.tower_id != user.tower_id:
        raise HTTPException(403, "Nur eigener Turm")

    old = guard.status.value
    guard.status = body.status
    log_action(db, user, "GUARD_STATUS", "guard", guard.id, {"from": old, "to": body.status.value})
    db.commit()
    db.refresh(guard)
    notify("guards_changed", {"id": guard.id})
    return guard


@router.patch("/{guard_id}/position", response_model=GuardOut)
def set_position(
    guard_id: int,
    body: PositionUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    guard = db.get(Guard, guard_id)
    if not guard:
        raise HTTPException(404, "Wachgänger nicht gefunden")
    if user.role == Role.WACHGAENGER and guard.user_id != user.id:
        raise HTTPException(403, "Nur eigene Position änderbar")

    guard.latitude = body.latitude
    guard.longitude = body.longitude
    db.commit()
    db.refresh(guard)
    notify("guards_changed", {"id": guard.id})
    return guard
