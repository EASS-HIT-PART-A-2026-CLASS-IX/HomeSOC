"""Shared Redis client for the alert notification queue and idempotency."""

from __future__ import annotations

import json
import logging

import redis.asyncio as redis

logger = logging.getLogger("homesoc.redis")

ALERT_QUEUE_KEY = "homesoc:alerts:pending"


async def get_redis(redis_url: str) -> redis.Redis:
    return redis.from_url(redis_url, decode_responses=True)


async def push_alert(r: redis.Redis, alert: dict) -> None:
    """Push an alert to the notification queue."""
    await r.lpush(ALERT_QUEUE_KEY, json.dumps(alert))


async def pop_alert(r: redis.Redis, timeout: int = 5) -> dict | None:
    """Blocking pop from the alert notification queue."""
    result = await r.brpop(ALERT_QUEUE_KEY, timeout=timeout)
    if result:
        _, data = result
        return json.loads(data)
    return None
