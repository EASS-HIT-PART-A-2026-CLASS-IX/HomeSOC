"""Alert query and management endpoints."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from shared.enums import AlertStatus

from ..db import repository

router = APIRouter(prefix="/api/v1", tags=["alerts"])

VALID_ALERT_STATUSES = tuple(s.value for s in AlertStatus)


class AlertStatusUpdate(BaseModel):
    status: Literal["open", "acknowledged", "resolved"]


@router.get("/alerts")
async def list_alerts(
    status: str | None = None,
    severity: str | None = None,
    limit: int = Query(default=50, le=500),
    offset: int = Query(default=0, ge=0),
) -> list[dict]:
    return await repository.get_alerts(
        status=status, severity=severity, limit=limit, offset=offset
    )


@router.patch("/alerts/{alert_id}")
async def update_alert(alert_id: str, body: AlertStatusUpdate) -> dict:
    updated = await repository.update_alert_status(alert_id, body.status)
    if not updated:
        raise HTTPException(status_code=404, detail="Alert not found")
    return {"id": alert_id, "status": body.status}


@router.delete("/alerts")
async def clear_alerts() -> dict:
    count = await repository.clear_alerts()
    return {"cleared": count}
