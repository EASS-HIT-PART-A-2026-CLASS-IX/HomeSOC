"""Alert notification worker — consumes from Redis queue and delivers alerts."""

from __future__ import annotations

import asyncio
import json
import logging
import sys
from datetime import datetime, timezone
from pathlib import Path

# Allow imports from project root
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from backend.config import settings
from backend.worker.redis_client import get_redis, pop_alert

logger = logging.getLogger("homesoc.notifier")
logging.basicConfig(level=logging.INFO, format="[notifier] %(message)s")

NOTIFICATION_LOG = Path(__file__).parent.parent / "data" / "notifications.log"


def _format_notification(alert: dict) -> str:
    """Format an alert into a human-readable notification line."""
    severity = alert.get("severity", "unknown").upper()
    title = alert.get("title", "Untitled Alert")
    description = alert.get("description", "")
    ts = datetime.now(timezone.utc).isoformat()
    return f"[{ts}] [{severity}] {title} — {description}"


async def run_notifier() -> None:
    """Main loop: consume alerts from Redis and deliver notifications."""
    r = await get_redis(settings.redis_url)

    try:
        await r.ping()
        logger.info("Connected to Redis at %s", settings.redis_url)
    except Exception as e:
        logger.error("Failed to connect to Redis: %s", e)
        return

    logger.info("Notifier worker started, listening on homesoc:alerts:pending")

    NOTIFICATION_LOG.parent.mkdir(parents=True, exist_ok=True)

    while True:
        try:
            alert = await pop_alert(r, timeout=5)
            if alert is None:
                continue

            notification = _format_notification(alert)
            logger.info("NOTIFY: %s", notification)

            # Write to notification log file
            with open(NOTIFICATION_LOG, "a") as f:
                f.write(notification + "\n")

        except asyncio.CancelledError:
            logger.info("Notifier worker shutting down")
            break
        except Exception:
            logger.exception("Error processing alert notification")
            await asyncio.sleep(1)

    await r.aclose()


if __name__ == "__main__":
    asyncio.run(run_notifier())
