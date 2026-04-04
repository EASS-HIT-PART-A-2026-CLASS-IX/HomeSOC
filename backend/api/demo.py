"""Demo endpoint for generating test events from the dashboard."""

from __future__ import annotations

import random
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Query, Request

router = APIRouter(prefix="/api/v1/demo", tags=["demo"])

_PROCESS_NAMES = ["bash", "zsh", "python3", "node", "curl", "ssh", "git", "nc", "nmap", "base64"]
_SUSPICIOUS = {"nc", "nmap", "base64"}
_EXTERNAL_IPS = ["142.250.80.46", "151.101.1.140", "104.244.42.65", "198.51.100.23"]
_PORTS = [80, 443, 22, 4444, 1337, 8080]


def _gen_process() -> dict:
    proc = random.choice(_PROCESS_NAMES)
    return {
        "id": str(uuid.uuid4()),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "agent_id": "demo-agent",
        "platform": "macos",
        "category": "process",
        "event_type": "process_exec",
        "severity": "high" if proc in _SUSPICIOUS else "info",
        "process_name": proc,
        "process_pid": random.randint(100, 65000),
        "process_path": f"/tmp/{proc}" if proc in _SUSPICIOUS else f"/usr/bin/{proc}",
        "process_user": random.choice(["gal", "root"]),
        "source": "demo",
    }


def _gen_network() -> dict:
    port = random.choice(_PORTS)
    return {
        "id": str(uuid.uuid4()),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "agent_id": "demo-agent",
        "platform": "macos",
        "category": "network",
        "event_type": "network_connection",
        "severity": "critical" if port in (4444, 1337) else "info",
        "process_name": random.choice(["curl", "Safari", "nc"]),
        "src_ip": "192.168.1.50",
        "src_port": random.randint(49152, 65535),
        "dst_ip": random.choice(_EXTERNAL_IPS),
        "dst_port": port,
        "protocol": "tcp",
        "source": "demo",
    }


def _gen_auth() -> dict:
    success = random.random() > 0.3
    return {
        "id": str(uuid.uuid4()),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "agent_id": "demo-agent",
        "platform": "macos",
        "category": "auth",
        "event_type": "auth_attempt",
        "severity": "info" if success else "medium",
        "auth_user": random.choice(["gal", "root", "admin"]),
        "auth_method": "password",
        "auth_success": success,
        "process_name": "sudo",
        "source": "demo",
    }


_GENERATORS = [_gen_process, _gen_network, _gen_auth]


@router.post("/generate")
async def generate_test_events(
    request: Request,
    count: int = Query(default=10, ge=1, le=100),
) -> dict:
    """Generate test events and push them through the ingestion pipeline."""
    events = [random.choice(_GENERATORS)() for _ in range(count)]
    pipeline = request.app.state.pipeline
    stored, alerts = await pipeline.process_batch(events)
    return {"events_generated": stored, "alerts_triggered": alerts}
