"""Database CRUD operations for HomeSOC."""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

import aiosqlite

from .connection import get_db

# ── Events ──────────────────────────────────────────────────────────────


_EVENT_COLS = [
    "id", "timestamp", "received_at", "agent_id", "platform",
    "category", "event_type", "severity", "process_name",
    "process_pid", "process_ppid", "process_path", "process_user",
    "process_args", "process_hash", "file_path", "file_action",
    "src_ip", "src_port", "dst_ip", "dst_port", "protocol",
    "dns_query", "auth_user", "auth_method", "auth_success",
    "raw", "source", "source_event_id",
]
_EVENT_PLACEHOLDERS = ", ".join(["?"] * len(_EVENT_COLS))
_EVENT_COL_NAMES = ", ".join(_EVENT_COLS)
_EVENT_INSERT_SQL = f"INSERT OR IGNORE INTO events ({_EVENT_COL_NAMES}) VALUES ({_EVENT_PLACEHOLDERS})"


def _serialize_for_db(ev: dict) -> list:
    """Build a VALUES row from an event dict without mutating the original."""
    values = []
    for col in _EVENT_COLS:
        val = ev.get(col)
        if col == "process_args" and val is not None:
            val = json.dumps(val)
        elif col == "raw" and val is not None:
            val = json.dumps(val)
        elif col == "auth_success" and val is not None:
            val = int(val)
        values.append(val)
    return values


async def insert_events(events: list[dict]) -> int:
    db = await get_db()
    count = 0
    for ev in events:
        await db.execute(_EVENT_INSERT_SQL, _serialize_for_db(ev))
        count += 1
    await db.commit()
    return count


async def get_events(
    category: str | None = None,
    severity: str | None = None,
    agent_id: str | None = None,
    event_type: str | None = None,
    since: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> list[dict]:
    db = await get_db()
    query = "SELECT * FROM events WHERE 1=1"
    params: list = []

    if category:
        query += " AND category = ?"
        params.append(category)
    if severity:
        query += " AND severity = ?"
        params.append(severity)
    if agent_id:
        query += " AND agent_id = ?"
        params.append(agent_id)
    if event_type:
        query += " AND event_type = ?"
        params.append(event_type)
    if since:
        query += " AND timestamp >= ?"
        params.append(since)

    query += " ORDER BY timestamp DESC LIMIT ? OFFSET ?"
    params.extend([limit, offset])

    cursor = await db.execute(query, params)
    rows = await cursor.fetchall()
    return [_row_to_dict(row) for row in rows]


async def get_event_by_id(event_id: str) -> dict | None:
    db = await get_db()
    cursor = await db.execute("SELECT * FROM events WHERE id = ?", [event_id])
    row = await cursor.fetchone()
    return _row_to_dict(row) if row else None


async def get_event_counts(since_hours: int = 24) -> dict:
    db = await get_db()
    since = (datetime.now(timezone.utc) - timedelta(hours=since_hours)).isoformat()

    total_cursor = await db.execute(
        "SELECT COUNT(*) FROM events WHERE timestamp >= ?", [since]
    )
    total = (await total_cursor.fetchone())[0]

    cat_cursor = await db.execute(
        "SELECT category, COUNT(*) as cnt FROM events WHERE timestamp >= ? GROUP BY category",
        [since],
    )
    by_category = {row[0]: row[1] for row in await cat_cursor.fetchall()}

    sev_cursor = await db.execute(
        "SELECT severity, COUNT(*) as cnt FROM events WHERE timestamp >= ? GROUP BY severity",
        [since],
    )
    by_severity = {row[0]: row[1] for row in await sev_cursor.fetchall()}

    return {
        "total": total,
        "by_category": by_category,
        "by_severity": by_severity,
    }


# ── Alerts ──────────────────────────────────────────────────────────────


async def insert_alert(alert: dict) -> None:
    db = await get_db()
    if alert.get("event_ids") is not None:
        alert["event_ids"] = json.dumps(alert["event_ids"])
    cols = [
        "id", "rule_id", "rule_name", "severity", "title",
        "description", "event_ids", "status", "created_at",
    ]
    values = [alert.get(c) for c in cols]
    placeholders = ", ".join(["?"] * len(cols))
    col_names = ", ".join(cols)
    await db.execute(
        f"INSERT INTO alerts ({col_names}) VALUES ({placeholders})", values
    )
    await db.commit()


async def get_alerts(
    status: str | None = None,
    severity: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[dict]:
    db = await get_db()
    query = "SELECT * FROM alerts WHERE 1=1"
    params: list = []
    if status:
        query += " AND status = ?"
        params.append(status)
    if severity:
        query += " AND severity = ?"
        params.append(severity)
    query += " ORDER BY created_at DESC LIMIT ? OFFSET ?"
    params.extend([limit, offset])
    cursor = await db.execute(query, params)
    rows = await cursor.fetchall()
    return [_row_to_dict(row) for row in rows]


async def update_alert_status(alert_id: str, status: str) -> bool:
    db = await get_db()
    resolved_at = datetime.now(timezone.utc).isoformat() if status == "resolved" else None
    cursor = await db.execute(
        "UPDATE alerts SET status = ?, resolved_at = ? WHERE id = ?",
        [status, resolved_at, alert_id],
    )
    await db.commit()
    return cursor.rowcount > 0


# ── Agents ──────────────────────────────────────────────────────────────


async def upsert_agent(agent: dict) -> None:
    db = await get_db()
    if agent.get("config") is not None:
        agent["config"] = json.dumps(agent["config"])
    await db.execute(
        """INSERT INTO agents (id, hostname, platform, ip_address, version, last_heartbeat, status)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             hostname=excluded.hostname,
             ip_address=excluded.ip_address,
             version=excluded.version,
             last_heartbeat=excluded.last_heartbeat,
             status=excluded.status""",
        [
            agent["id"], agent["hostname"], agent["platform"],
            agent.get("ip_address"), agent.get("version"),
            agent.get("last_heartbeat"), agent.get("status", "online"),
        ],
    )
    await db.commit()


async def update_agent_status(agent_id: str, status: str) -> bool:
    db = await get_db()
    cursor = await db.execute(
        "UPDATE agents SET status = ? WHERE id = ?",
        [status, agent_id],
    )
    await db.commit()
    return cursor.rowcount > 0


async def get_agent_by_id(agent_id: str) -> dict | None:
    db = await get_db()
    cursor = await db.execute("SELECT * FROM agents WHERE id = ?", [agent_id])
    row = await cursor.fetchone()
    return _row_to_dict(row) if row else None


async def get_agents() -> list[dict]:
    db = await get_db()
    cursor = await db.execute("SELECT * FROM agents ORDER BY last_heartbeat DESC")
    rows = await cursor.fetchall()
    return [_row_to_dict(row) for row in rows]


async def mark_stale_agents_offline(timeout_seconds: int = 60) -> int:
    """Mark agents as offline if their last heartbeat exceeds the timeout."""
    db = await get_db()
    cutoff = (datetime.now(timezone.utc) - timedelta(seconds=timeout_seconds)).isoformat()
    cursor = await db.execute(
        "UPDATE agents SET status = 'offline' WHERE status = 'online' AND last_heartbeat < ?",
        [cutoff],
    )
    await db.commit()
    return cursor.rowcount


# ── Clear ───────────────────────────────────────────────────────────────


async def delete_agent(agent_id: str) -> bool:
    db = await get_db()
    cursor = await db.execute("DELETE FROM agents WHERE id = ?", [agent_id])
    await db.commit()
    return cursor.rowcount > 0


async def clear_events() -> int:
    db = await get_db()
    cursor = await db.execute("SELECT COUNT(*) FROM events")
    count = (await cursor.fetchone())[0]
    await db.execute("DELETE FROM events")
    await db.commit()
    return count


async def clear_alerts() -> int:
    db = await get_db()
    cursor = await db.execute("SELECT COUNT(*) FROM alerts")
    count = (await cursor.fetchone())[0]
    await db.execute("DELETE FROM alerts")
    await db.commit()
    return count


# ── Retention ──────────────────────────────────────────────────────────


async def purge_old_events(retention_days: int) -> int:
    """Delete events older than retention_days. Returns number of rows removed."""
    db = await get_db()
    cutoff = (datetime.now(timezone.utc) - timedelta(days=retention_days)).isoformat()
    cursor = await db.execute(
        "DELETE FROM events WHERE timestamp < ?", [cutoff]
    )
    await db.commit()
    return cursor.rowcount


async def purge_old_alerts(retention_days: int) -> int:
    """Delete resolved/false-positive alerts older than retention_days."""
    db = await get_db()
    cutoff = (datetime.now(timezone.utc) - timedelta(days=retention_days)).isoformat()
    cursor = await db.execute(
        "DELETE FROM alerts WHERE created_at < ? AND status IN ('resolved', 'false_positive')",
        [cutoff],
    )
    await db.commit()
    return cursor.rowcount


# ── Users ──────────────────────────────────────────────────────────────


async def create_user(user_id: str, username: str, hashed_password: str, role: str = "viewer") -> dict:
    db = await get_db()
    await db.execute(
        "INSERT INTO users (id, username, hashed_password, role) VALUES (?, ?, ?, ?)",
        [user_id, username, hashed_password, role],
    )
    await db.commit()
    return {"id": user_id, "username": username, "role": role}


async def get_user_by_username(username: str) -> dict | None:
    db = await get_db()
    cursor = await db.execute("SELECT * FROM users WHERE username = ?", [username])
    row = await cursor.fetchone()
    return dict(row) if row else None


async def get_users() -> list[dict]:
    db = await get_db()
    cursor = await db.execute("SELECT id, username, role, created_at FROM users ORDER BY created_at")
    return [dict(r) for r in await cursor.fetchall()]


async def delete_user(user_id: str) -> bool:
    db = await get_db()
    cursor = await db.execute("DELETE FROM users WHERE id = ?", [user_id])
    await db.commit()
    return cursor.rowcount > 0


# ── Helpers ─────────────────────────────────────────────────────────────


def _row_to_dict(row: aiosqlite.Row) -> dict:
    d = dict(row)
    # Deserialize JSON fields
    for field in ("process_args", "raw", "event_ids", "config"):
        if field in d and isinstance(d[field], str):
            try:
                d[field] = json.loads(d[field])
            except (json.JSONDecodeError, TypeError):
                pass
    # Convert auth_success back to bool
    if "auth_success" in d and d["auth_success"] is not None:
        d["auth_success"] = bool(d["auth_success"])
    return d
