from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from .models import (
    BoatStatus,
    GuardStatus,
    OperationStatus,
    RequestReason,
    RequestStatus,
    Role,
    TowerStatus,
)


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---- Auth / User ----
class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserBase(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    full_name: str = Field(min_length=1, max_length=128)
    role: Role = Role.WACHGAENGER
    tower_id: int | None = None


class UserCreate(UserBase):
    password: str = Field(min_length=6, max_length=128)


class UserUpdate(BaseModel):
    full_name: str | None = Field(default=None, max_length=128)
    role: Role | None = None
    tower_id: int | None = None
    is_active: bool | None = None
    password: str | None = Field(default=None, min_length=6, max_length=128)


class UserOut(ORMModel):
    id: int
    username: str
    full_name: str
    role: Role
    tower_id: int | None
    is_active: bool


# ---- Tower ----
class TowerBase(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    call_sign: str = Field(min_length=1, max_length=64)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    required_staff: int = Field(default=2, ge=0, le=50)


class TowerCreate(TowerBase):
    pass


class TowerUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=128)
    call_sign: str | None = Field(default=None, max_length=64)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    required_staff: int | None = Field(default=None, ge=0, le=50)


class TowerOut(ORMModel):
    id: int
    name: str
    call_sign: str
    latitude: float
    longitude: float
    required_staff: int
    status: TowerStatus
    staff_in_area: int


# ---- Guard ----
class GuardOut(ORMModel):
    id: int
    name: str
    user_id: int | None
    tower_id: int | None
    status: GuardStatus
    latitude: float | None
    longitude: float | None
    updated_at: datetime


class GuardStatusUpdate(BaseModel):
    status: GuardStatus


class PositionUpdate(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


# ---- Boat ----
class BoatBase(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    call_sign: str = Field(min_length=1, max_length=64)
    tower_id: int | None = None
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)


class BoatCreate(BoatBase):
    pass


class BoatUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=128)
    call_sign: str | None = Field(default=None, max_length=64)
    tower_id: int | None = None
    status: BoatStatus | None = None
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)


class BoatOut(ORMModel):
    id: int
    name: str
    call_sign: str
    tower_id: int | None
    status: BoatStatus
    latitude: float | None
    longitude: float | None
    updated_at: datetime


# ---- Minus-One Request ----
class MinusOneCreate(BaseModel):
    guard_id: int
    reason: RequestReason
    note: str | None = Field(default=None, max_length=500)


class RejectBody(BaseModel):
    rejection_reason: str | None = Field(default=None, max_length=500)


class RequestOut(ORMModel):
    id: int
    guard_id: int
    requested_by: int
    reason: RequestReason
    note: str | None
    status: RequestStatus
    created_at: datetime
    decided_at: datetime | None
    decided_by: int | None
    returned_at: datetime | None
    rejection_reason: str | None
    guard_name: str | None = None
    tower_id: int | None = None


# ---- Dashboard ----
class DashboardSummary(BaseModel):
    tower_count: int
    on_duty_count: int
    active_minus_one: int
    boat_count: int
    boats_in_service: int
    pending_requests: int
    towers_green: int
    towers_yellow: int
    towers_red: int


# ---- Audit ----
class AuditOut(ORMModel):
    id: int
    actor_name: str
    action: str
    entity_type: str | None
    entity_id: int | None
    detail: dict
    created_at: datetime


# ---- Operation (vorbereitet) ----
class OperationOut(ORMModel):
    id: int
    operation_number: str
    location: str
    alarm_time: datetime
    status: OperationStatus
    description: str | None
    involved_units: dict
