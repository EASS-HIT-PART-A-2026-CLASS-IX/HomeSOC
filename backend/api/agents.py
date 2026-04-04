"""Agent registration, heartbeat, and listing endpoints."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from shared.protocol import AgentRegistration, HeartbeatPayload

from ..db import repository
from .auth import require_api_key
from .ws import manager

router = APIRouter(prefix="/api/v1", tags=["agents"])

# Agent IDs that should shut down on next heartbeat
_pending_shutdown: set[str] = set()


@router.post("/register", dependencies=[Depends(require_api_key)])
async def register_agent(reg: AgentRegistration) -> dict:
    # Check if agent is currently stopped — don't override that status
    existing = await repository.get_agent_by_id(reg.agent_id)
    if existing and existing.get("status") == "stopped":
        # Update heartbeat/metadata but keep it stopped
        agent = {
            "id": reg.agent_id,
            "hostname": reg.hostname,
            "platform": reg.platform,
            "ip_address": reg.ip_address,
            "version": reg.version,
            "last_heartbeat": datetime.now(timezone.utc).isoformat(),
            "status": "stopped",
        }
        await repository.upsert_agent(agent)
        return {"status": "stopped", "agent_id": reg.agent_id, "command": "shutdown"}

    agent = {
        "id": reg.agent_id,
        "hostname": reg.hostname,
        "platform": reg.platform,
        "ip_address": reg.ip_address,
        "version": reg.version,
        "last_heartbeat": datetime.now(timezone.utc).isoformat(),
        "status": "online",
    }
    await repository.upsert_agent(agent)
    await manager.broadcast({"type": "agent_status", "data": agent})
    return {"status": "registered", "agent_id": reg.agent_id}


@router.post("/heartbeat", dependencies=[Depends(require_api_key)])
async def heartbeat(hb: HeartbeatPayload) -> dict:
    # Check current status before overwriting
    existing = await repository.get_agent_by_id(hb.agent_id)

    # If agent is stopped (either in DB or pending), tell it to shut down
    if hb.agent_id in _pending_shutdown or (existing and existing.get("status") == "stopped"):
        _pending_shutdown.discard(hb.agent_id)
        await repository.update_agent_status(hb.agent_id, "stopped")
        return {"status": "ok", "command": "shutdown"}

    agent = {
        "id": hb.agent_id,
        "hostname": hb.hostname,
        "platform": hb.platform,
        "ip_address": hb.ip_address,
        "version": hb.version,
        "last_heartbeat": datetime.now(timezone.utc).isoformat(),
        "status": "online",
    }
    await repository.upsert_agent(agent)
    return {"status": "ok"}


@router.post("/deregister", dependencies=[Depends(require_api_key)])
async def deregister_agent(body: dict) -> dict:
    """Called by agents on graceful shutdown to mark themselves offline."""
    agent_id = body.get("agent_id")
    if not agent_id:
        raise HTTPException(status_code=400, detail="agent_id required")
    updated = await repository.update_agent_status(agent_id, "offline")
    if updated:
        await manager.broadcast(
            {"type": "agent_status", "data": {"id": agent_id, "status": "offline"}}
        )
    return {"status": "offline", "agent_id": agent_id}


@router.post("/agents")
async def create_agent(reg: AgentRegistration) -> dict:
    """Manually register an agent from the dashboard."""
    existing = await repository.get_agent_by_id(reg.agent_id)
    if existing:
        raise HTTPException(status_code=409, detail="Agent ID already exists")
    agent = {
        "id": reg.agent_id,
        "hostname": reg.hostname,
        "platform": reg.platform,
        "ip_address": reg.ip_address,
        "version": reg.version,
        "last_heartbeat": datetime.now(timezone.utc).isoformat(),
        "status": "offline",
    }
    await repository.upsert_agent(agent)
    await manager.broadcast({"type": "agent_status", "data": agent})
    return {"status": "registered", "agent_id": reg.agent_id}


@router.get("/agents")
async def list_agents() -> list[dict]:
    return await repository.get_agents()


@router.delete("/agents/{agent_id}", dependencies=[Depends(require_api_key)])
async def delete_agent(agent_id: str) -> dict:
    deleted = await repository.delete_agent(agent_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Agent not found")
    _pending_shutdown.discard(agent_id)
    await manager.broadcast({"type": "agent_status", "data": {"id": agent_id, "status": "removed"}})
    return {"deleted": agent_id}


@router.post("/agents/{agent_id}/stop", dependencies=[Depends(require_api_key)])
async def stop_agent(agent_id: str) -> dict:
    """Request an agent to shut down gracefully."""
    updated = await repository.update_agent_status(agent_id, "stopped")
    if not updated:
        raise HTTPException(status_code=404, detail="Agent not found")
    # Also queue shutdown command for real agents with heartbeat loops
    _pending_shutdown.add(agent_id)
    await manager.broadcast(
        {"type": "agent_status", "data": {"id": agent_id, "status": "stopped"}}
    )
    return {"status": "stopped", "agent_id": agent_id}


@router.post("/agents/{agent_id}/resume")
async def resume_agent(agent_id: str) -> dict:
    """Mark an agent as online again."""
    updated = await repository.update_agent_status(agent_id, "online")
    if not updated:
        raise HTTPException(status_code=404, detail="Agent not found")
    _pending_shutdown.discard(agent_id)
    await manager.broadcast(
        {"type": "agent_status", "data": {"id": agent_id, "status": "online"}}
    )
    return {"status": "online", "agent_id": agent_id}
