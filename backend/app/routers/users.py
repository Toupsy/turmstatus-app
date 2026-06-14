from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..audit import log_action
from ..database import get_db
from ..deps import require_roles
from ..models import Guard, Role, User
from ..schemas import UserCreate, UserOut, UserUpdate
from ..security import hash_password

router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("", response_model=list[UserOut])
def list_users(
    db: Session = Depends(get_db),
    admin: User = Depends(require_roles(Role.HAUPTWACHE)),
):
    return db.query(User).order_by(User.username).all()


@router.post("", response_model=UserOut, status_code=201)
def create_user(
    body: UserCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_roles(Role.HAUPTWACHE)),
):
    if db.query(User).filter(User.username == body.username).first():
        raise HTTPException(409, "Benutzername bereits vergeben")
    user = User(
        username=body.username,
        full_name=body.full_name,
        role=body.role,
        tower_id=body.tower_id,
        hashed_password=hash_password(body.password),
    )
    db.add(user)
    db.flush()
    # Für Wachgänger automatisch ein Lageobjekt anlegen.
    if user.role == Role.WACHGAENGER:
        db.add(Guard(name=user.full_name, user_id=user.id, tower_id=user.tower_id))
    log_action(db, admin, "USER_CREATED", "user", user.id,
               {"username": user.username, "role": user.role.value})
    db.commit()
    db.refresh(user)
    return user


@router.patch("/{user_id}", response_model=UserOut)
def update_user(
    user_id: int,
    body: UserUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_roles(Role.HAUPTWACHE)),
):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(404, "Benutzer nicht gefunden")
    data = body.model_dump(exclude_unset=True)
    if "password" in data and data["password"]:
        user.hashed_password = hash_password(data.pop("password"))
    else:
        data.pop("password", None)
    for k, v in data.items():
        setattr(user, k, v)
    log_action(db, admin, "USER_UPDATED", "user", user.id, {"fields": list(data.keys())})
    db.commit()
    db.refresh(user)
    return user
