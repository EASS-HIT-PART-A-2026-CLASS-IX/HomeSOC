#!/usr/bin/env python3
"""Re-evaluate stored events against current detection rules.

Uses bounded concurrency, retries with exponential backoff, and
Redis-backed idempotency to avoid duplicate alerts on re-runs.

Usage:
    python scripts/refresh.py [--redis-url URL] [--batch-size N] [--concurrency N]
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import logging
import os
import sys
from pathlib import Path

# Allow imports from project root
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import redis.asyncio as redis

from backend.config import settings
from backend.db.connection import init_db, close_db, get_db
from backend.engine.detector import DetectionEngine
from backend.db import repository

logging.basicConfig(level=logging.INFO, format="[refresh] %(message)s")
logger = logging.getLogger("refresh")

# Idempotency key prefix in Redis
IDEM_PREFIX = "refresh"
MAX_RETRIES = 3


def _rule_version(engine: DetectionEngine) -> str:
    """Compute a hash of all loaded rules to version the rule set."""
    rules_json = json.dumps(
        [{"id": r["id"], "conditions": r.get("conditions")} for r in engine.rules],
        sort_keys=True,
    )
    return "v" + hashlib.sha256(rules_json.encode()).hexdigest()[:8]


async def _fetch_event_batches(batch_size: int) -> list[list[dict]]:
    """Fetch all events from DB in batches."""
    db = await get_db()
    cursor = await db.execute("SELECT COUNT(*) FROM events")
    row = await cursor.fetchone()
    total = row[0]

    batches = []
    for offset in range(0, total, batch_size):
        cursor = await db.execute(
            "SELECT * FROM events ORDER BY timestamp LIMIT ? OFFSET ?",
            [batch_size, offset],
        )
        rows = await cursor.fetchall()
        batches.append([dict(r) for r in rows])

    return batches


async def _process_batch(
    batch_idx: int,
    batch: list[dict],
    engine: DetectionEngine,
    r: redis.Redis,
    rule_version: str,
    semaphore: asyncio.Semaphore,
) -> int:
    """Process a single batch with bounded concurrency, retries, and idempotency."""
    idem_key = f"{IDEM_PREFIX}:{rule_version}:batch-{batch_idx}"

    # Check idempotency — skip if already processed
    if await r.exists(idem_key):
        logger.info("Skipping batch %d — already processed (idempotency key exists)", batch_idx + 1)
        return 0

    alerts_generated = 0

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            async with semaphore:
                for ev in batch:
                    # Deserialize JSON fields that come back as strings from SQLite
                    for field in ("process_args", "raw", "event_ids"):
                        if field in ev and isinstance(ev[field], str):
                            try:
                                ev[field] = json.loads(ev[field])
                            except (json.JSONDecodeError, TypeError):
                                pass
                    if "auth_success" in ev and ev["auth_success"] is not None:
                        ev["auth_success"] = bool(ev["auth_success"])

                    alerts = engine.evaluate(ev)
                    for alert in alerts:
                        await repository.insert_alert(alert)
                        alerts_generated += 1

            # Mark batch as processed with 7-day TTL
            await r.set(idem_key, "1", ex=7 * 86400)
            break  # Success

        except Exception as e:
            if attempt < MAX_RETRIES:
                wait = 2**attempt
                logger.warning("Batch %d attempt %d failed: %s. Retrying in %ds...", batch_idx + 1, attempt, e, wait)
                await asyncio.sleep(wait)
            else:
                logger.error("Batch %d failed after %d attempts: %s", batch_idx + 1, MAX_RETRIES, e)

    return alerts_generated


async def main(redis_url: str, batch_size: int, concurrency: int) -> None:
    r = redis.from_url(redis_url, decode_responses=True)

    try:
        await r.ping()
        logger.info("Connected to Redis at %s", redis_url)
    except Exception as e:
        logger.error("Cannot connect to Redis: %s", e)
        return

    await init_db()

    engine = DetectionEngine(settings.rules_dir)
    rv = _rule_version(engine)
    logger.info("Rule version: %s", rv)

    batches = await _fetch_event_batches(batch_size)
    total_events = sum(len(b) for b in batches)
    logger.info("Found %d events in %d batch(es)", total_events, len(batches))

    if not batches:
        logger.info("No events to process.")
        await close_db()
        await r.aclose()
        return

    semaphore = asyncio.Semaphore(concurrency)
    tasks = [
        _process_batch(i, batch, engine, r, rv, semaphore)
        for i, batch in enumerate(batches)
    ]
    results = await asyncio.gather(*tasks)
    total_alerts = sum(results)
    skipped = sum(1 for res in results if res == 0)

    logger.info(
        "Done. %d new alerts from %d re-evaluated events (%d batches skipped).",
        total_alerts,
        total_events - skipped * batch_size,
        skipped,
    )

    await close_db()
    await r.aclose()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Re-evaluate events against current detection rules")
    parser.add_argument("--redis-url", default=os.environ.get("HOMESOC_REDIS_URL", "redis://localhost:6379/0"))
    parser.add_argument("--batch-size", type=int, default=100)
    parser.add_argument("--concurrency", type=int, default=10)
    args = parser.parse_args()

    asyncio.run(main(args.redis_url, args.batch_size, args.concurrency))
