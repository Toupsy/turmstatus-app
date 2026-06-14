import enum
from datetime import datetime, timezone

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Role(str, enum.Enum):
    HAUPTWACHE = "HAUPTWACHE"
    TURMFUEHRER = "TURMFUEHRER"
    WACHGAENGER = "WACHGAENGER"


class TowerStatus(str, enum.Enum):
    GREEN = "GREEN"      # vollständig besetzt
    YELLOW = "YELLOW"    # reduzierte Stärke
    RED = "RED"          # kritisch besetzt


class GuardStatus(str, enum.Enum):
    IN_AREA = "IN_AREA"        # Im Bereich
    MINUS_ONE = "MINUS_ONE"    # -1 aktiv
    DEPLOYED = "DEPLOYED"      # Einsatz
    BREAK = "BREAK"            # Pause


class BoatStatus(str, enum.Enum):
    AT_TOWER = "AT_TOWER"            # Am Turm
    PATROL = "PATROL"               # Auf Streife
    DEPLOYED = "DEPLOYED"           # Im Einsatz
    OUT_OF_SERVICE = "OUT_OF_SERVICE"  # Außer Dienst


class RequestReason(str, enum.Enum):
    PAUSE = "PAUSE"
    TOILET = "TOILET"
    CATERING = "CATERING"      # Verpflegung
    MATERIAL = "MATERIAL"      # Material holen
    OTHER = "OTHER"            # Sonstiges


class RequestStatus(str, enum.Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"      # -1 AKTIV
    REJECTED = "REJECTED"
    RETURNED = "RETURNED"      # +1


class OperationStatus(str, enum.Enum):
    NEW = "NEW"
    RUNNING = "RUNNING"
    CLOSED = "CLOSED"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(128))
    hashed_password: Mapped[str] = mapped_column(String(255))
    role: Mapped[Role] = mapped_column(Enum(Role), default=Role.WACHGAENGER)
    tower_id: Mapped[int | None] = mapped_column(ForeignKey("towers.id"), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    tower = relationship("Tower", back_populates="users")
    guard = relationship("Guard", back_populates="user", uselist=False)


class Tower(Base):
    __tablename__ = "towers"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(128))
    call_sign: Mapped[str] = mapped_column(String(64))
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    required_staff: Mapped[int] = mapped_column(Integer, default=2)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    users = relationship("User", back_populates="tower")
    guards = relationship("Guard", back_populates="tower")
    boats = relationship("Boat", back_populates="tower")

    def derive_status(self) -> TowerStatus:
        in_area = sum(1 for g in self.guards if g.status == GuardStatus.IN_AREA)
        if self.required_staff <= 0:
            return TowerStatus.GREEN
        if in_area >= self.required_staff:
            return TowerStatus.GREEN
        if in_area >= self.required_staff / 2:
            return TowerStatus.YELLOW
        return TowerStatus.RED


class Guard(Base):
    __tablename__ = "guards"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(128))
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    tower_id: Mapped[int | None] = mapped_column(ForeignKey("towers.id"), nullable=True)
    status: Mapped[GuardStatus] = mapped_column(Enum(GuardStatus), default=GuardStatus.IN_AREA)
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )

    user = relationship("User", back_populates="guard")
    tower = relationship("Tower", back_populates="guards")


class Boat(Base):
    __tablename__ = "boats"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(128))
    call_sign: Mapped[str] = mapped_column(String(64))
    tower_id: Mapped[int | None] = mapped_column(ForeignKey("towers.id"), nullable=True)
    status: Mapped[BoatStatus] = mapped_column(Enum(BoatStatus), default=BoatStatus.AT_TOWER)
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )

    tower = relationship("Tower", back_populates="boats")


class MinusOneRequest(Base):
    __tablename__ = "minus_one_requests"

    id: Mapped[int] = mapped_column(primary_key=True)
    guard_id: Mapped[int] = mapped_column(ForeignKey("guards.id"))
    requested_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    reason: Mapped[RequestReason] = mapped_column(Enum(RequestReason))
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[RequestStatus] = mapped_column(
        Enum(RequestStatus), default=RequestStatus.PENDING, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    decided_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    returned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    guard = relationship("Guard", foreign_keys=[guard_id])


class Operation(Base):
    """Einsatz – Datenmodell vorbereitet, Verwaltung folgt später."""

    __tablename__ = "operations"

    id: Mapped[int] = mapped_column(primary_key=True)
    operation_number: Mapped[str] = mapped_column(String(64), unique=True)
    location: Mapped[str] = mapped_column(String(255))
    alarm_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    status: Mapped[OperationStatus] = mapped_column(
        Enum(OperationStatus), default=OperationStatus.NEW
    )
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    involved_units: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    actor_name: Mapped[str] = mapped_column(String(128), default="system")
    action: Mapped[str] = mapped_column(String(64), index=True)
    entity_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    entity_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    detail: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, index=True
    )
