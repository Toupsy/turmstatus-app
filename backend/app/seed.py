"""Idempotente Erst-Befüllung: Admin (Hauptwache) + Demo-Lage an der Ostsee.

Wird beim Start ausgeführt und legt nur dann Daten an, wenn noch keine Türme
existieren. Passwörter werden gehasht gespeichert.
"""

from sqlalchemy.orm import Session

from .config import settings
from .models import (
    Boat,
    BoatStatus,
    Guard,
    GuardStatus,
    Role,
    Tower,
    User,
)
from .security import hash_password

# Wachtürme an realistischen Ostsee-Strandkoordinaten (Lübecker Bucht / Travemünde).
TOWERS = [
    {"name": "Turm Nord – Brodten", "call_sign": "Florian Wasser 11", "lat": 53.9710, "lon": 10.8780, "required_staff": 2},
    {"name": "Turm Mitte – Travemünde", "call_sign": "Florian Wasser 12", "lat": 53.9580, "lon": 10.8730, "required_staff": 3},
    {"name": "Turm Süd – Priwall", "call_sign": "Florian Wasser 13", "lat": 53.9460, "lon": 10.8800, "required_staff": 2},
    {"name": "Turm Timmendorf", "call_sign": "Florian Wasser 14", "lat": 53.9990, "lon": 10.7790, "required_staff": 2},
]

BOATS = [
    {"name": "RTB Seehund", "call_sign": "Seenot 1", "status": BoatStatus.AT_TOWER, "tower_idx": 1},
    {"name": "RTB Möwe", "call_sign": "Seenot 2", "status": BoatStatus.PATROL, "tower_idx": 0},
]


def seed_initial_data(db: Session) -> None:
    if db.query(Tower).count() > 0:
        return

    # 1) Türme
    towers: list[Tower] = []
    for t in TOWERS:
        tower = Tower(
            name=t["name"],
            call_sign=t["call_sign"],
            latitude=t["lat"],
            longitude=t["lon"],
            required_staff=t["required_staff"],
        )
        db.add(tower)
        towers.append(tower)
    db.flush()

    # 2) Hauptwache-Admin
    if not db.query(User).filter(User.username == settings.admin_username).first():
        db.add(
            User(
                username=settings.admin_username,
                full_name="Hauptwache Leitung",
                hashed_password=hash_password(settings.admin_password),
                role=Role.HAUPTWACHE,
            )
        )

    # 3) Pro Turm ein Turmführer + zwei Wachgänger (mit verknüpften Guard-Objekten)
    for i, tower in enumerate(towers, start=1):
        leader = User(
            username=f"turmfuehrer{i}",
            full_name=f"Turmführer {tower.name}",
            hashed_password=hash_password("turm2024"),
            role=Role.TURMFUEHRER,
            tower_id=tower.id,
        )
        db.add(leader)

        for j in range(1, 3):
            guard_user = User(
                username=f"wache{i}_{j}",
                full_name=f"Rettungsschwimmer {i}.{j}",
                hashed_password=hash_password("wache2024"),
                role=Role.WACHGAENGER,
                tower_id=tower.id,
            )
            db.add(guard_user)
            db.flush()
            db.add(
                Guard(
                    name=guard_user.full_name,
                    user_id=guard_user.id,
                    tower_id=tower.id,
                    status=GuardStatus.IN_AREA,
                    latitude=tower.latitude + 0.0009 * j,
                    longitude=tower.longitude + 0.0006 * j,
                )
            )

    # 4) Boote
    for b in BOATS:
        tower = towers[b["tower_idx"]]
        db.add(
            Boat(
                name=b["name"],
                call_sign=b["call_sign"],
                status=b["status"],
                tower_id=tower.id,
                latitude=tower.latitude + 0.0015,
                longitude=tower.longitude + 0.0015,
            )
        )

    db.commit()
