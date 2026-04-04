"""Event ingestion pipeline — normalize, detect, store, broadcast."""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from ..db import repository
from ..engine.detector import DetectionEngine
from ..api.ws import manager

logger = logging.getLogger("homesoc.pipeline")


class IngestionPipeline:
    """Orchestrates event processing: store → detect → alert → broadcast."""

    def __init__(self, detection_engine: DetectionEngine, redis_client=None) -> None:
        self.engine = detection_engine
        self.redis = redis_client
        self._total_processed = 0
        self._total_alerts = 0

    async def process_batch(self, events: list[dict]) -> tuple[int, int]:
        """Process a batch of events. Returns (events_stored, alerts_generated)."""
        now = datetime.now(timezone.utc).isoformat()

        # Ensure received_at is set
        for ev in events:
            if not ev.get("received_at"):
                ev["received_at"] = now

        # Store events
        stored = await repository.insert_events(events)

        # Run detection on each event
        alerts_generated = 0
        for ev in events:
            alerts = self.engine.evaluate(ev)
            for alert in alerts:
                await repository.insert_alert(alert)
                await manager.broadcast({"type": "alert", "data": alert})
                # Push to Redis notification queue if available
                if self.redis:
                    try:
                        from ..worker.redis_client import push_alert
                        await push_alert(self.redis, alert)
                    except Exception:
                        logger.debug("Redis unavailable, skipping alert queue")
                alerts_generated += 1

        # Broadcast events to dashboard
        for ev in events:
            await manager.broadcast({"type": "event", "data": ev})

        self._total_processed += stored
        self._total_alerts += alerts_generated

        return stored, alerts_generated

    @property
    def stats(self) -> dict:
        return {
            "total_processed": self._total_processed,
            "total_alerts": self._total_alerts,
        }
