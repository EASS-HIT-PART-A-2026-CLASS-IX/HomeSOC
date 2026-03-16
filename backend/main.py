"""HomeSOC Backend — FastAPI application entry point."""

from __future__ import annotations

import asyncio
import logging
import sys
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

logger = logging.getLogger("homesoc")

# Allow imports from project root
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend.api import agents, alerts, dashboard, events, rules
from backend.api.ws import manager
from backend.config import settings
from backend.db.connection import close_db, init_db
from backend.db import repository
from backend.engine.detector import DetectionEngine
from backend.ingestion.pipeline import IngestionPipeline


async def _stale_agent_checker() -> None:
    """Background task that marks agents offline when heartbeats go stale."""
    while True:
        await asyncio.sleep(30)
        count = await repository.mark_stale_agents_offline(settings.heartbeat_timeout_seconds)
        if count > 0:
            logger.info("Marked %d stale agent(s) as offline", count)
            await manager.broadcast({"type": "agent_status", "data": {"refresh": True}})


_RETENTION_CHECK_INTERVAL = 3600  # Run once per hour


async def _retention_enforcer() -> None:
    """Background task that purges events and resolved alerts past retention."""
    while True:
        await asyncio.sleep(_RETENTION_CHECK_INTERVAL)
        try:
            events_purged = await repository.purge_old_events(settings.event_retention_days)
            alerts_purged = await repository.purge_old_alerts(settings.event_retention_days)
            if events_purged or alerts_purged:
                logger.info(
                    "Retention cleanup: purged %d event(s) and %d alert(s) older than %d day(s)",
                    events_purged,
                    alerts_purged,
                    settings.event_retention_days,
                )
        except Exception:
            logger.exception("Retention enforcement failed")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await init_db()

    # Initialize detection engine and pipeline
    engine = DetectionEngine(settings.rules_dir)
    pipeline = IngestionPipeline(engine)
    app.state.pipeline = pipeline

    # Start background tasks
    checker_task = asyncio.create_task(_stale_agent_checker())
    retention_task = asyncio.create_task(_retention_enforcer())

    api_key = settings.ensure_api_key()
    print(f"[HomeSOC] Backend started on {settings.host}:{settings.port}")
    print(f"[HomeSOC] Database: {settings.db_path}")
    print(f"[HomeSOC] Detection rules loaded: {len(engine.rules)}")
    print(f"[HomeSOC] Event retention: {settings.event_retention_days} day(s)")
    print(f"[HomeSOC] API Key: {api_key}")
    print(f"[HomeSOC]   Set HOMESOC_API_KEY env var to use a fixed key")
    print(f"[HomeSOC]   Agents must send X-API-Key header on all requests")
    yield
    # Shutdown
    checker_task.cancel()
    retention_task.cancel()
    await close_db()
    print("[HomeSOC] Backend shut down")


app = FastAPI(
    title="HomeSOC",
    description="Home Security Operations Center — Backend API",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount routers
app.include_router(events.router)
app.include_router(alerts.router)
app.include_router(agents.router)
app.include_router(dashboard.router)
app.include_router(rules.router)


@app.websocket("/ws/live")
async def websocket_live(ws: WebSocket):
    await manager.connect(ws)
    try:
        while True:
            # Keep connection alive; client can send pings
            await ws.receive_text()
    except WebSocketDisconnect:
        logger.debug("WebSocket client disconnected")
        manager.disconnect(ws)


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "ws_clients": manager.active_count,
    }
