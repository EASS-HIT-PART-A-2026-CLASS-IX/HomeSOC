"""Tests for event/alert retention enforcement."""

from __future__ import annotations

import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import aiosqlite

from backend.db.models import CREATE_TABLES


async def _setup_db(tmp_path: Path) -> aiosqlite.Connection:
    """Create an in-memory-style temp DB with the full schema."""
    db_path = tmp_path / "test.db"
    db = await aiosqlite.connect(str(db_path))
    db.row_factory = aiosqlite.Row
    for stmt in CREATE_TABLES:
        await db.execute(stmt)
    await db.commit()
    return db


def _ts(days_ago: int) -> str:
    return (datetime.now(timezone.utc) - timedelta(days=days_ago)).isoformat()


# ── purge_old_events ─────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_purge_old_events_deletes_expired(tmp_path, monkeypatch):
    db = await _setup_db(tmp_path)
    monkeypatch.setattr("backend.db.repository.get_db", lambda: _fake_get_db(db))

    # Insert 3 events: 10 days old, 5 days old, 1 day old
    for days_ago in (10, 5, 1):
        await db.execute(
            "INSERT INTO events (id, timestamp, received_at, agent_id, platform, category, event_type, severity, source) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [str(uuid.uuid4()), _ts(days_ago), _ts(days_ago), "agent-1", "macos", "process", "exec", "info", "test"],
        )
    await db.commit()

    from backend.db import repository

    count = await repository.purge_old_events(retention_days=7)

    # 10-day and 5-day events should be gone (both older than 7 days... wait, 5 < 7)
    # Actually only the 10-day event is older than 7 days
    assert count == 1

    cursor = await db.execute("SELECT COUNT(*) FROM events")
    remaining = (await cursor.fetchone())[0]
    assert remaining == 2

    await db.close()


@pytest.mark.asyncio
async def test_purge_old_events_keeps_recent(tmp_path, monkeypatch):
    db = await _setup_db(tmp_path)
    monkeypatch.setattr("backend.db.repository.get_db", lambda: _fake_get_db(db))

    # All events are recent (within retention)
    for days_ago in (1, 2, 3):
        await db.execute(
            "INSERT INTO events (id, timestamp, received_at, agent_id, platform, category, event_type, severity, source) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [str(uuid.uuid4()), _ts(days_ago), _ts(days_ago), "agent-1", "macos", "process", "exec", "info", "test"],
        )
    await db.commit()

    from backend.db import repository

    count = await repository.purge_old_events(retention_days=7)
    assert count == 0

    cursor = await db.execute("SELECT COUNT(*) FROM events")
    remaining = (await cursor.fetchone())[0]
    assert remaining == 3

    await db.close()


# ── purge_old_alerts ─────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_purge_old_alerts_only_deletes_resolved(tmp_path, monkeypatch):
    """Only resolved/false_positive alerts past retention get purged. Open alerts stay."""
    db = await _setup_db(tmp_path)
    monkeypatch.setattr("backend.db.repository.get_db", lambda: _fake_get_db(db))

    # Old resolved alert (should be purged)
    await db.execute(
        "INSERT INTO alerts (id, rule_id, rule_name, severity, title, status, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        ["alert-old-resolved", "rule-1", "Test", "high", "Old Resolved", "resolved", _ts(10)],
    )
    # Old false_positive alert (should be purged)
    await db.execute(
        "INSERT INTO alerts (id, rule_id, rule_name, severity, title, status, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        ["alert-old-fp", "rule-1", "Test", "high", "Old FP", "false_positive", _ts(10)],
    )
    # Old but still OPEN alert (should NOT be purged)
    await db.execute(
        "INSERT INTO alerts (id, rule_id, rule_name, severity, title, status, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        ["alert-old-open", "rule-1", "Test", "critical", "Old Open", "open", _ts(10)],
    )
    # Recent resolved alert (should NOT be purged)
    await db.execute(
        "INSERT INTO alerts (id, rule_id, rule_name, severity, title, status, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        ["alert-new-resolved", "rule-1", "Test", "medium", "New Resolved", "resolved", _ts(2)],
    )
    await db.commit()

    from backend.db import repository

    count = await repository.purge_old_alerts(retention_days=7)
    assert count == 2  # Only old resolved + old false_positive

    cursor = await db.execute("SELECT id FROM alerts ORDER BY id")
    remaining = [row[0] for row in await cursor.fetchall()]
    assert "alert-old-open" in remaining, "Open alerts must survive regardless of age"
    assert "alert-new-resolved" in remaining, "Recent alerts must survive"
    assert "alert-old-resolved" not in remaining
    assert "alert-old-fp" not in remaining

    await db.close()


@pytest.mark.asyncio
async def test_purge_returns_zero_when_nothing_to_delete(tmp_path, monkeypatch):
    db = await _setup_db(tmp_path)
    monkeypatch.setattr("backend.db.repository.get_db", lambda: _fake_get_db(db))

    from backend.db import repository

    assert await repository.purge_old_events(retention_days=7) == 0
    assert await repository.purge_old_alerts(retention_days=7) == 0

    await db.close()


# ── Helper ───────────────────────────────────────────────────────────


def _fake_get_db(db):
    """Return an awaitable that yields the test DB connection."""
    import asyncio

    async def _get():
        return db

    # get_db is async, so we need to return the coroutine result
    # But repository calls `await get_db()`, so we return a coroutine
    return _get()
