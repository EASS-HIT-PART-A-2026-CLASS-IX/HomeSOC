"""HomeSOC Backend — FastAPI application entry point."""

from __future__ import annotations

import asyncio
import logging
import sys
import time
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

logger = logging.getLogger("homesoc")

# Allow imports from project root
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend.api import agents, alerts, dashboard, demo, events, rules, setup, users
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

    # Try to connect to Redis (optional — runs fine without it)
    redis_client = None
    try:
        from backend.worker.redis_client import get_redis
        redis_client = await get_redis(settings.redis_url)
        await redis_client.ping()
        logger.info("Connected to Redis at %s", settings.redis_url)
    except Exception:
        logger.info("Redis not available — alert notification queue disabled")
        redis_client = None

    pipeline = IngestionPipeline(engine, redis_client=redis_client)
    app.state.pipeline = pipeline
    app.state.redis = redis_client

    # Start background tasks
    checker_task = asyncio.create_task(_stale_agent_checker())
    retention_task = asyncio.create_task(_retention_enforcer())

    api_key = settings.ensure_api_key()
    logger.info("Backend started on %s:%d", settings.host, settings.port)
    logger.info("Database: %s", settings.db_path)
    logger.info("Detection rules loaded: %d", len(engine.rules))
    logger.info("Event retention: %d day(s)", settings.event_retention_days)
    logger.info("API Key: %s", api_key)
    logger.info("  Key persisted at backend/data/.api_key (0600) — stable across restarts")
    logger.info("  Override with HOMESOC_API_KEY env var if needed")
    logger.info("  Agents must send X-API-Key: <key> header on all requests")
    yield
    # Shutdown
    checker_task.cancel()
    retention_task.cancel()
    if redis_client:
        await redis_client.aclose()
    await close_db()
    logger.info("Backend shut down")


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Simple in-memory rate limiter that adds standard rate-limit headers."""

    RATE_LIMIT = 600  # requests per window
    WINDOW_SECONDS = 60

    def __init__(self, app):
        super().__init__(app)
        self._buckets: dict[str, list[float]] = {}

    async def dispatch(self, request: Request, call_next):
        # Agent event/heartbeat POSTs are high-frequency by design — skip rate limiting for them
        if request.url.path in ("/api/v1/events", "/api/v1/heartbeat"):
            return await call_next(request)

        client_ip = request.client.host if request.client else "unknown"
        now = time.time()
        cutoff = now - self.WINDOW_SECONDS

        # Clean and count
        bucket = self._buckets.setdefault(client_ip, [])
        bucket[:] = [t for t in bucket if t > cutoff]
        remaining = max(0, self.RATE_LIMIT - len(bucket))

        if len(bucket) >= self.RATE_LIMIT:
            return JSONResponse(
                status_code=429,
                content={"detail": "Rate limit exceeded"},
                headers={
                    "X-RateLimit-Limit": str(self.RATE_LIMIT),
                    "X-RateLimit-Remaining": "0",
                    "X-RateLimit-Reset": str(int(cutoff + self.WINDOW_SECONDS)),
                    "Retry-After": str(self.WINDOW_SECONDS),
                },
            )

        bucket.append(now)
        response = await call_next(request)
        response.headers["X-RateLimit-Limit"] = str(self.RATE_LIMIT)
        response.headers["X-RateLimit-Remaining"] = str(remaining)
        response.headers["X-RateLimit-Reset"] = str(int(now + self.WINDOW_SECONDS))
        return response


app = FastAPI(
    title="HomeSOC",
    description="Home Security Operations Center — Backend API",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(RateLimitMiddleware)

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
app.include_router(users.router)
app.include_router(demo.router)
app.include_router(setup.router)


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
async def health(request: Request):
    return {
        "status": "ok",
        "ws_clients": manager.active_count,
    }
