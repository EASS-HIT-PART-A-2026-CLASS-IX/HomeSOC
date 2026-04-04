"""Agent setup instructions endpoint."""

from __future__ import annotations

from fastapi import APIRouter, Query

from ..config import settings

router = APIRouter(prefix="/api/v1/setup", tags=["setup"])

# TODO: protect with require_jwt + require_role("admin") once dashboard auth is wired up

_MACOS_INSTRUCTIONS = {
    "commands": [
        {
            "label": "Start the agent",
            "description": "Run this from the HomeSoc project root. Launches the agent with your backend address, agent ID, and API key. The agent will begin collecting process, file, and network events from this machine and send them to the HomeSoc backend.",
            "cmd": "sudo python agents/macos/main.py --backend-url {backend_url} --agent-id {agent_id} --api-key {api_key}",
        },
    ],
    "notes": [
        "Requires sudo — eslogger needs root access to monitor system-level events.",
        "Your terminal app needs Full Disk Access (System Settings → Privacy & Security → Full Disk Access).",
        "The agent will send a heartbeat every 30 seconds and appear as online in the dashboard.",
        "To stop the agent: press Ctrl+C in this terminal. The agent will shut down gracefully and appear as offline in the dashboard.",
    ],
}


@router.get("/agent-instructions")
async def get_agent_instructions(
    agent_id: str = Query(..., description="The agent ID to generate instructions for"),
    platform: str = Query("macos", description="Target platform"),
) -> dict:
    api_key = settings.ensure_api_key()
    backend_url = f"http://localhost:{settings.port}"

    commands = [
        {
            "label": step["label"],
            "description": step["description"],
            "cmd": step["cmd"].format(backend_url=backend_url, agent_id=agent_id, api_key=api_key),
        }
        for step in _MACOS_INSTRUCTIONS["commands"]
    ]

    return {
        "api_key": api_key,
        "backend_url": backend_url,
        "agent_id": agent_id,
        "platform": "macos",
        "commands": commands,
        "notes": _MACOS_INSTRUCTIONS["notes"],
    }
