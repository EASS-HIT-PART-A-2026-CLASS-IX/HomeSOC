"""CRUD happy-path tests using FastAPI TestClient + JWT auth tests."""

from __future__ import annotations

import os
import sys
import tempfile
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

# Use a temp DB so tests don't touch production data
_test_db = os.path.join(tempfile.mkdtemp(), "test_api.db")
os.environ["HOMESOC_DB_PATH"] = _test_db

from backend.config import settings
settings.db_path = _test_db

from backend.main import app


@pytest.fixture(scope="module")
def api():
    """Provide a TestClient with lifespan (DB initialized)."""
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c


# ── Helpers ─────────────────────────────────────────────────────────────


def _api_key_header() -> dict:
    key = settings.ensure_api_key()
    return {"X-API-Key": key}


def _make_event(event_id: str | None = None) -> dict:
    return {
        "id": event_id or str(uuid.uuid4()),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "agent_id": "test-agent",
        "platform": "macos",
        "category": "process",
        "event_type": "process_exec",
        "severity": "info",
        "process_name": "bash",
        "source": "test",
    }


def _register_and_login(api, username: str = None, password: str = "testpass123", role: str = "admin") -> str:
    """Register a user and return the JWT access token."""
    username = username or f"user-{uuid.uuid4().hex[:8]}"
    api.post(
        "/api/v1/auth/register",
        json={"username": username, "password": password, "role": role},
    )
    resp = api.post(
        "/api/v1/auth/login",
        data={"username": username, "password": password},
    )
    return resp.json()["access_token"]


# ── Events CRUD ─────────────────────────────────────────────────────────


def test_ingest_and_query_events(api):
    """POST events and then GET them back."""
    ev = _make_event()
    batch = {
        "agent_id": "test-agent",
        "batch_id": str(uuid.uuid4()),
        "events": [ev],
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    resp = api.post("/api/v1/events", json=batch, headers=_api_key_header())
    assert resp.status_code == 200
    body = resp.json()
    assert body["accepted"] >= 1

    resp = api.get("/api/v1/events", params={"agent_id": "test-agent", "limit": 5})
    assert resp.status_code == 200
    assert len(resp.json()) >= 1


def test_get_single_event(api):
    """POST an event and GET it by ID."""
    ev = _make_event()
    batch = {
        "agent_id": "test-agent",
        "batch_id": str(uuid.uuid4()),
        "events": [ev],
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    api.post("/api/v1/events", json=batch, headers=_api_key_header())

    resp = api.get(f"/api/v1/events/{ev['id']}")
    assert resp.status_code == 200
    assert resp.json()["id"] == ev["id"]


def test_get_nonexistent_event_returns_404(api):
    resp = api.get("/api/v1/events/does-not-exist")
    assert resp.status_code == 404


def test_delete_events_requires_api_key(api):
    resp = api.delete("/api/v1/events")
    assert resp.status_code == 401

    resp = api.delete("/api/v1/events", headers=_api_key_header())
    assert resp.status_code == 200


# ── Alerts CRUD ─────────────────────────────────────────────────────────


def test_list_alerts(api):
    resp = api.get("/api/v1/alerts")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


def test_patch_alert_status(api):
    """Insert an event that triggers an alert, then PATCH its status."""
    ev = _make_event()
    ev["process_name"] = "nmap"
    ev["severity"] = "high"
    batch = {
        "agent_id": "test-agent",
        "batch_id": str(uuid.uuid4()),
        "events": [ev],
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    api.post("/api/v1/events", json=batch, headers=_api_key_header())

    resp = api.get("/api/v1/alerts", params={"limit": 5})
    alerts = resp.json()
    if alerts:
        alert_id = alerts[0]["id"]
        resp = api.patch(f"/api/v1/alerts/{alert_id}", json={"status": "acknowledged"})
        assert resp.status_code == 200
        assert resp.json()["status"] == "acknowledged"


def test_patch_nonexistent_alert_returns_404(api):
    resp = api.patch("/api/v1/alerts/does-not-exist", json={"status": "resolved"})
    assert resp.status_code == 404


def test_delete_alerts_requires_api_key(api):
    resp = api.delete("/api/v1/alerts")
    assert resp.status_code == 401


# ── Agents CRUD ─────────────────────────────────────────────────────────


def test_register_and_list_agents(api):
    agent_id = f"test-agent-{uuid.uuid4().hex[:6]}"
    reg = {
        "agent_id": agent_id,
        "hostname": "test-host",
        "platform": "macos",
        "ip_address": "127.0.0.1",
        "version": "0.1.0",
    }
    resp = api.post("/api/v1/register", json=reg, headers=_api_key_header())
    assert resp.status_code == 200
    assert resp.json()["agent_id"] == agent_id

    resp = api.get("/api/v1/agents")
    assert resp.status_code == 200
    agent_ids = [a["id"] for a in resp.json()]
    assert agent_id in agent_ids


def test_stop_and_resume_agent(api):
    agent_id = f"test-agent-{uuid.uuid4().hex[:6]}"
    reg = {
        "agent_id": agent_id,
        "hostname": "test-host",
        "platform": "macos",
        "ip_address": "127.0.0.1",
        "version": "0.1.0",
    }
    api.post("/api/v1/register", json=reg, headers=_api_key_header())

    resp = api.post(f"/api/v1/agents/{agent_id}/stop", headers=_api_key_header())
    assert resp.status_code == 200
    assert resp.json()["status"] == "stopped"

    resp = api.post(f"/api/v1/agents/{agent_id}/resume")
    assert resp.status_code == 200
    assert resp.json()["status"] == "online"


def test_delete_agent(api):
    agent_id = f"test-agent-{uuid.uuid4().hex[:6]}"
    reg = {
        "agent_id": agent_id,
        "hostname": "test-host",
        "platform": "macos",
        "ip_address": "127.0.0.1",
        "version": "0.1.0",
    }
    api.post("/api/v1/register", json=reg, headers=_api_key_header())

    resp = api.delete(f"/api/v1/agents/{agent_id}", headers=_api_key_header())
    assert resp.status_code == 200
    assert resp.json()["deleted"] == agent_id


def test_delete_nonexistent_agent_returns_404(api):
    resp = api.delete("/api/v1/agents/does-not-exist", headers=_api_key_header())
    assert resp.status_code == 404


# ── Rules ───────────────────────────────────────────────────────────────


def test_list_rules(api):
    resp = api.get("/api/v1/rules")
    assert resp.status_code == 200
    rules = resp.json()
    assert len(rules) >= 1


# ── Dashboard ───────────────────────────────────────────────────────────


def test_dashboard_summary(api):
    resp = api.get("/api/v1/dashboard/summary")
    assert resp.status_code == 200
    body = resp.json()
    assert "total_events_24h" in body
    assert "total_alerts_open" in body


# ── Health + Rate Limit ─────────────────────────────────────────────────


def test_health_check(api):
    resp = api.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


def test_health_has_ratelimit_headers(api):
    resp = api.get("/health")
    assert "x-ratelimit-limit" in resp.headers
    assert "x-ratelimit-remaining" in resp.headers
    assert "x-ratelimit-reset" in resp.headers


# ── JWT Auth ────────────────────────────────────────────────────────────


def test_register_user(api):
    username = f"user-{uuid.uuid4().hex[:8]}"
    resp = api.post(
        "/api/v1/auth/register",
        json={"username": username, "password": "pass123", "role": "viewer"},
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["username"] == username
    assert body["role"] == "viewer"


def test_register_duplicate_user_returns_409(api):
    username = f"user-{uuid.uuid4().hex[:8]}"
    api.post("/api/v1/auth/register", json={"username": username, "password": "pass123"})
    resp = api.post("/api/v1/auth/register", json={"username": username, "password": "pass123"})
    assert resp.status_code == 409


def test_login_success(api):
    username = f"user-{uuid.uuid4().hex[:8]}"
    api.post("/api/v1/auth/register", json={"username": username, "password": "pass123"})

    resp = api.post("/api/v1/auth/login", data={"username": username, "password": "pass123"})
    assert resp.status_code == 200
    assert "access_token" in resp.json()


def test_login_wrong_password(api):
    username = f"user-{uuid.uuid4().hex[:8]}"
    api.post("/api/v1/auth/register", json={"username": username, "password": "pass123"})

    resp = api.post("/api/v1/auth/login", data={"username": username, "password": "wrong"})
    assert resp.status_code == 401


def test_jwt_me_endpoint(api):
    token = _register_and_login(api)
    resp = api.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert "username" in resp.json()


def test_jwt_no_token_returns_401(api):
    resp = api.get("/api/v1/auth/me")
    assert resp.status_code == 401


def test_jwt_invalid_token_returns_401(api):
    resp = api.get("/api/v1/auth/me", headers={"Authorization": "Bearer invalid.token.here"})
    assert resp.status_code == 401


def test_jwt_expired_token_returns_401(api):
    """A token with an expiration in the past should be rejected."""
    from jose import jwt as jose_jwt

    expired_token = jose_jwt.encode(
        {"sub": "admin", "role": "admin", "exp": datetime.now(timezone.utc) - timedelta(hours=1)},
        settings.ensure_jwt_secret(),
        algorithm=settings.jwt_algorithm,
    )
    resp = api.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {expired_token}"})
    assert resp.status_code == 401


def test_jwt_viewer_cannot_list_users(api):
    """Viewer role should be forbidden from the admin-only /users endpoint."""
    token = _register_and_login(api, role="viewer")
    resp = api.get("/api/v1/auth/users", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 403


def test_jwt_admin_can_list_users(api):
    token = _register_and_login(api, role="admin")
    resp = api.get("/api/v1/auth/users", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)
