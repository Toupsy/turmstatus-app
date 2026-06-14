from contextlib import asynccontextmanager

from fastapi import APIRouter, Depends, FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from sqlalchemy.orm import Session

from .config import settings
from .database import Base, SessionLocal, engine, get_db
from .deps import get_current_user
from .limiter import limiter
from .models import Operation, User
from .schemas import OperationOut
from .security import decode_token
from .seed import seed_initial_data
from .ws import manager

# Router
from .routers import (  # noqa: E402
    audit,
    auth,
    boats,
    dashboard,
    guards,
    requests,
    towers,
    users,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Tabellen anlegen und Demo-/Admin-Daten seeden (idempotent).
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        seed_initial_data(db)
    finally:
        db.close()
    yield


app = FastAPI(
    title="Turmstatus – Wach- und Statussystem",
    version="1.0.0",
    description="Digitales Lage- und Statussystem für den Wasserrettungsdienst.",
    lifespan=lifespan,
)

# Rate-Limiting
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, lambda r, e: _rate_limit_handler(r, e))
app.add_middleware(SlowAPIMiddleware)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _rate_limit_handler(request, exc):
    from fastapi.responses import JSONResponse

    return JSONResponse(
        status_code=429,
        content={"detail": "Zu viele Anfragen – bitte kurz warten."},
    )


# REST-Router einbinden
for r in (auth, towers, guards, boats, requests, dashboard, users, audit):
    app.include_router(r.router)


# Operations (vorbereitet, nur Lesezugriff)
ops_router = APIRouter(prefix="/api/operations", tags=["operations"])


@ops_router.get("", response_model=list[OperationOut])
def list_operations(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return db.query(Operation).order_by(Operation.alarm_time.desc()).all()


app.include_router(ops_router)


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.websocket("/api/ws")
async def websocket_endpoint(ws: WebSocket):
    # Authentifizierung per Token-Query-Parameter (Browser-WebSocket kann keine Header setzen).
    token = ws.query_params.get("token")
    if not token or not decode_token(token):
        await ws.close(code=1008)
        return
    await manager.connect(ws)
    try:
        while True:
            # Eingehende Nachrichten ignorieren – der Kanal dient nur dem Server-Push.
            await ws.receive_text()
    except WebSocketDisconnect:
        await manager.disconnect(ws)
    except Exception:
        await manager.disconnect(ws)
