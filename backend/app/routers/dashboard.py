from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import (
    Boat,
    BoatStatus,
    Guard,
    GuardStatus,
    MinusOneRequest,
    RequestStatus,
    Tower,
    TowerStatus,
    User,
)
from ..schemas import DashboardSummary

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/summary", response_model=DashboardSummary)
def summary(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    towers = db.query(Tower).all()
    guards = db.query(Guard).all()
    boats = db.query(Boat).all()

    statuses = [t.derive_status() for t in towers]
    on_duty = sum(
        1 for g in guards if g.status in (GuardStatus.IN_AREA, GuardStatus.DEPLOYED)
    )
    return DashboardSummary(
        tower_count=len(towers),
        on_duty_count=on_duty,
        active_minus_one=sum(1 for g in guards if g.status == GuardStatus.MINUS_ONE),
        boat_count=len(boats),
        boats_in_service=sum(1 for b in boats if b.status != BoatStatus.OUT_OF_SERVICE),
        pending_requests=db.query(MinusOneRequest)
        .filter(MinusOneRequest.status == RequestStatus.PENDING)
        .count(),
        towers_green=sum(1 for s in statuses if s == TowerStatus.GREEN),
        towers_yellow=sum(1 for s in statuses if s == TowerStatus.YELLOW),
        towers_red=sum(1 for s in statuses if s == TowerStatus.RED),
    )
