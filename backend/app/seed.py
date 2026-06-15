"""Idempotente Erst-Befüllung: Admin (Hauptwache) + Lage Wasserrettungsstation Dahme.

Wird beim Start ausgeführt und legt nur dann Daten an, wenn noch keine Türme
existieren. Passwörter werden gehasht gespeichert.

Haupt-Einsatzgebiet: DLRG-Wasserrettungsstation Dahme (ZWRD-K Wachstation 206),
Hauptwache „An der Strandpromenade 30a, 23747 Dahme/Ostholstein“. Die Station
sichert rund 6 km Ostsee-Badestrand (Süd- bis Nordstrand) mit 7 Rettungstürmen
und 2 Motorrettungsbooten ab.

ACHTUNG – Koordinaten: Die folgenden Turm-Positionen sind NÄHERUNGSWERTE, gleich-
mäßig entlang des realen Dahmer Strandes (Südstrand/Dahmeshöved bis Nordstrand
Richtung Kellenhusen) verteilt. Exakte GPS-Punkte je Turm sind öffentlich nicht
abrufbar und sollten bei Gelegenheit per Google Maps/GPS nachgemessen und in der
Admin-Oberfläche bzw. hier korrigiert werden.
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

# Rettungstürme der Wasserrettungsstation Dahme – Näherungskoordinaten entlang des
# Badestrandes von Süd (Dahmeshöved) nach Nord (Richtung Kellenhusen).
TOWERS = [
    {"name": "Turm 1 – Südstrand (Dahmeshöved)", "call_sign": "Dahme 1", "lat": 54.1955, "lon": 11.0855, "required_staff": 2},
    {"name": "Turm 2 – Südstrand", "call_sign": "Dahme 2", "lat": 54.2010, "lon": 11.0895, "required_staff": 2},
    {"name": "Turm 3 – Strandpromenade Süd", "call_sign": "Dahme 3", "lat": 54.2065, "lon": 11.0915, "required_staff": 3},
    {"name": "Turm 4 – Hauptstrand (Hauptwache)", "call_sign": "Dahme 4", "lat": 54.2120, "lon": 11.0928, "required_staff": 3},
    {"name": "Turm 5 – Strandpromenade Nord", "call_sign": "Dahme 5", "lat": 54.2175, "lon": 11.0930, "required_staff": 3},
    {"name": "Turm 6 – Nordstrand", "call_sign": "Dahme 6", "lat": 54.2230, "lon": 11.0922, "required_staff": 2},
    {"name": "Turm 7 – Nordstrand (Richtung Kellenhusen)", "call_sign": "Dahme 7", "lat": 54.2285, "lon": 11.0905, "required_staff": 2},
]

BOATS = [
    {"name": "Motorrettungsboot Dahme 1", "call_sign": "Boot Dahme 1", "status": BoatStatus.AT_TOWER, "tower_idx": 3},
    {"name": "Motorrettungsboot Dahme 2", "call_sign": "Boot Dahme 2", "status": BoatStatus.PATROL, "tower_idx": 5},
]


def ensure_admin(db: Session) -> None:
    """Stellt sicher, dass das Hauptwache-Konto existiert – unabhängig vom
    übrigen Demo-Seed. So ist nach jedem Start mindestens ein Login möglich."""
    admin = db.query(User).filter(User.username == settings.admin_username).first()
    if admin:
        # Optionaler Notfall-Reset des Passworts (ADMIN_RESET_PASSWORD=true).
        if settings.admin_reset_password:
            admin.hashed_password = hash_password(settings.admin_password)
            admin.is_active = True
            db.commit()
        return
    db.add(
        User(
            username=settings.admin_username,
            full_name="Hauptwache Leitung",
            hashed_password=hash_password(settings.admin_password),
            role=Role.HAUPTWACHE,
        )
    )
    db.commit()


def seed_initial_data(db: Session) -> None:
    # Admin immer sicherstellen (auch bei bereits befüllter Datenbank).
    ensure_admin(db)

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

    # 2) Pro Turm ein Turmführer + zwei Wachgänger (mit verknüpften Guard-Objekten)
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
