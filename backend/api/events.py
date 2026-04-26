"""Event ingestion and query endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from shared.protocol import BatchResponse, EventBatch

from ..db import repository
from .auth import require_api_key

router = APIRouter(prefix="/api/v1", tags=["events"])


@router.post("/events", response_model=BatchResponse, dependencies=[Depends(require_api_key)])
async def ingest_events(batch: EventBatch, request: Request) -> BatchResponse:
    events_dicts = []
    for ev in batch.events:
        d = ev.model_dump(mode="json")
        events_dicts.append(d)

    pipeline = request.app.state.pipeline
    stored, alerts = await pipeline.process_batch(events_dicts)

    return BatchResponse(accepted=stored)


@router.get("/events")
async def query_events(
    category: str | None = None,
    severity: str | None = None,
    agent_id: str | None = None,
    event_type: str | None = None,
    since: str | None = None,
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0, le=1_000_000),
) -> list[dict]:
    return await repository.get_events(
        category=category,
        severity=severity,
        agent_id=agent_id,
        event_type=event_type,
        since=since,
        limit=limit,
        offset=offset,
    )


@router.get("/events/{event_id}")
async def get_event(event_id: str) -> dict:
    event = await repository.get_event_by_id(event_id)
    if event is None:
        raise HTTPException(status_code=404, detail="Event not found")
    return event


@router.delete("/events")
async def clear_events() -> dict:
    count = await repository.clear_events()
    return {"cleared": count}
