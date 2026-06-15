from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..audit import log_action
from ..database import get_db
from ..deps import get_current_user, require_roles
from ..models import GuardStatus, Role, Tower, User
from ..schemas import TowerCreate, TowerOut, TowerUpdate
from ..ws import notify

router = APIRouter(prefix="/api/towers", tags=["towers"])


def serialize(tower: Tower) -> TowerOut:
    in_area = sum(1 for g in tower.guards if g.status == GuardStatus.IN_AREA)
    return TowerOut(
        id=tower.id,
        name=tower.name,
        call_sign=tower.call_sign,
        latitude=tower.latitude,
        longitude=tower.longitude,
        required_staff=tower.required_staff,
        status=tower.derive_status(),
        staff_in_area=in_area,
    )


@router.get("", response_model=list[TowerOut])
def list_towers(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return [serialize(t) for t in db.query(Tower).order_by(Tower.name).all()]


@router.post("", response_model=TowerOut, status_code=201)
def create_tower(
    body: TowerCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(Role.HAUPTWACHE)),
):
    tower = Tower(**body.model_dump())
    db.add(tower)
    db.flush()
    log_action(db, user, "TOWER_CREATED", "tower", tower.id, body.model_dump())
    db.commit()
    db.refresh(tower)
    notify("towers_changed", {"id": tower.id})
    return serialize(tower)


@router.patch("/{tower_id}", response_model=TowerOut)
def update_tower(
    tower_id: int,
    body: TowerUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    tower = db.get(Tower, tower_id)
    if not tower:
        raise HTTPException(404, "Turm nicht gefunden")
    # Turmführer darf nur den eigenen Turm bearbeiten.
    if user.role == Role.TURMFUEHRER and user.tower_id != tower_id:
        raise HTTPException(403, "Nur eigener Turm bearbeitbar")
    if user.role == Role.WACHGAENGER:
        raise HTTPException(403, "Keine Berechtigung")

    changes = body.model_dump(exclude_unset=True)
    for k, v in changes.items():
        setattr(tower, k, v)
    log_action(db, user, "TOWER_UPDATED", "tower", tower.id, changes)
    db.commit()
    db.refresh(tower)
    notify("towers_changed", {"id": tower.id})
    return serialize(tower)


@router.delete("/{tower_id}", status_code=204)
def delete_tower(
    tower_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(Role.HAUPTWACHE)),
):
    tower = db.get(Tower, tower_id)
    if not tower:
        raise HTTPException(404, "Turm nicht gefunden")
    # Zugeordnete Datensätze blockieren das Löschen – erst neu zuordnen.
    blockers = []
    if tower.users:
        blockers.append(f"{len(tower.users)} Benutzer")
    if tower.guards:
        blockers.append(f"{len(tower.guards)} Wachgänger")
    if tower.boats:
        blockers.append(f"{len(tower.boats)} Boote")
    if blockers:
        raise HTTPException(
            409,
            "Turm kann nicht gelöscht werden – noch zugeordnet: " + ", ".join(blockers),
        )
    log_action(db, user, "TOWER_DELETED", "tower", tower.id, {"name": tower.name})
    db.delete(tower)
    db.commit()
    notify("towers_changed", {"id": tower_id})
