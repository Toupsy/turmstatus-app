from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..audit import log_action
from ..database import get_db
from ..deps import get_current_user, require_roles
from ..models import Boat, Role, User
from ..schemas import BoatCreate, BoatOut, BoatUpdate
from ..ws import notify

router = APIRouter(prefix="/api/boats", tags=["boats"])


@router.get("", response_model=list[BoatOut])
def list_boats(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return db.query(Boat).order_by(Boat.name).all()


@router.post("", response_model=BoatOut, status_code=201)
def create_boat(
    body: BoatCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(Role.HAUPTWACHE)),
):
    boat = Boat(**body.model_dump())
    db.add(boat)
    db.flush()
    log_action(db, user, "BOAT_CREATED", "boat", boat.id, body.model_dump())
    db.commit()
    db.refresh(boat)
    notify("boats_changed", {"id": boat.id})
    return boat


@router.patch("/{boat_id}", response_model=BoatOut)
def update_boat(
    boat_id: int,
    body: BoatUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(Role.HAUPTWACHE, Role.TURMFUEHRER)),
):
    boat = db.get(Boat, boat_id)
    if not boat:
        raise HTTPException(404, "Boot nicht gefunden")
    changes = body.model_dump(exclude_unset=True)
    for k, v in changes.items():
        setattr(boat, k, v)
    log_action(db, user, "BOAT_UPDATED", "boat", boat.id, changes)
    db.commit()
    db.refresh(boat)
    notify("boats_changed", {"id": boat.id})
    return boat


@router.delete("/{boat_id}", status_code=204)
def delete_boat(
    boat_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(Role.HAUPTWACHE)),
):
    boat = db.get(Boat, boat_id)
    if not boat:
        raise HTTPException(404, "Boot nicht gefunden")
    log_action(db, user, "BOAT_DELETED", "boat", boat.id, {"name": boat.name})
    db.delete(boat)
    db.commit()
    notify("boats_changed", {"id": boat_id})
