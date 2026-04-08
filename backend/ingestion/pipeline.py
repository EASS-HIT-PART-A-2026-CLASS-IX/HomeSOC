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

    @staticmethod
    def _is_whitelisted(event: dict, whitelist: list[dict]) -> bool:
        """Return True if the event matches any whitelist entry and should be dropped."""
        for entry in whitelist:
            field = entry.get("field", "")
            value = entry.get("value", "")
            match_type = entry.get("match_type", "exact")
            if not field or not value:
                continue
            ev_val = str(event.get(field) or "")
            if match_type == "exact" and ev_val == value:
                return True
            if match_type == "prefix" and ev_val.startswith(value):
                return True
            if match_type == "contains" and value in ev_val:
                return True
        return False

    async def process_batch(self, events: list[dict]) -> tuple[int, int]:
        """Process a batch of events. Returns (events_stored, alerts_generated)."""
        now = datetime.now(timezone.utc).isoformat()

        # Ensure received_at is set
        for ev in events:
            if not ev.get("received_at"):
                ev["received_at"] = now

        # Cache per-agent config to avoid repeated DB lookups in a batch
        _agent_config_cache: dict[str, dict] = {}

        async def _get_config(agent_id: str) -> dict:
            if agent_id not in _agent_config_cache:
                agent = await repository.get_agent_by_id(agent_id)
                _agent_config_cache[agent_id] = (agent.get("config") or {}) if agent else {}
            return _agent_config_cache[agent_id]

        # Filter whitelisted events before storing
        filtered_events = []
        for ev in events:
            config = await _get_config(ev.get("agent_id", ""))
            whitelist = config.get("whitelist", [])
            if not self._is_whitelisted(ev, whitelist):
                filtered_events.append(ev)
        events = filtered_events

        # Store events
        stored = await repository.insert_events(events)

        # Run detection on each event
        alerts_generated = 0
        for ev in events:
            config = await _get_config(ev.get("agent_id", ""))
            enabled_rules: dict = config.get("enabled_rules", {})
            disabled = {rid for rid, on in enabled_rules.items() if not on}
            alerts = self.engine.evaluate(ev, disabled)
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
