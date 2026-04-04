"""Tests for scripts/refresh.py — rule re-evaluation with Redis idempotency."""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path
from unittest.mock import AsyncMock, patch, MagicMock

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


@pytest.mark.anyio
async def test_rule_version_changes_with_rules():
    """The rule version hash should change when rules change."""
    from scripts.refresh import _rule_version

    engine1 = MagicMock()
    engine1.rules = [{"id": "rule-1", "conditions": {"category": "process"}}]

    engine2 = MagicMock()
    engine2.rules = [{"id": "rule-1", "conditions": {"category": "network"}}]

    engine3 = MagicMock()
    engine3.rules = [{"id": "rule-1", "conditions": {"category": "process"}}]

    v1 = _rule_version(engine1)
    v2 = _rule_version(engine2)
    v3 = _rule_version(engine3)

    assert v1 != v2, "Different rules should produce different versions"
    assert v1 == v3, "Same rules should produce the same version"
    assert v1.startswith("v"), "Version should start with 'v'"


@pytest.mark.anyio
async def test_process_batch_skips_idempotent():
    """A batch already marked in Redis should be skipped."""
    from scripts.refresh import _process_batch

    mock_redis = AsyncMock()
    mock_redis.exists = AsyncMock(return_value=True)  # Key exists — already processed

    mock_engine = MagicMock()
    mock_semaphore = __import__("asyncio").Semaphore(10)

    result = await _process_batch(
        batch_idx=0,
        batch=[{"id": "evt-1", "platform": "macos", "category": "process"}],
        engine=mock_engine,
        r=mock_redis,
        rule_version="v12345678",
        semaphore=mock_semaphore,
    )

    assert result == 0, "Idempotent batch should return 0 alerts"
    mock_engine.evaluate.assert_not_called()


@pytest.mark.anyio
async def test_process_batch_evaluates_and_marks():
    """A new batch should be evaluated and its idempotency key set in Redis."""
    from scripts.refresh import _process_batch

    mock_redis = AsyncMock()
    mock_redis.exists = AsyncMock(return_value=False)  # Key doesn't exist — new batch
    mock_redis.set = AsyncMock()

    mock_engine = MagicMock()
    mock_engine.evaluate = MagicMock(return_value=[])  # No alerts

    mock_semaphore = __import__("asyncio").Semaphore(10)

    with patch("scripts.refresh.repository") as mock_repo:
        mock_repo.insert_alert = AsyncMock()

        result = await _process_batch(
            batch_idx=0,
            batch=[{"id": "evt-1", "platform": "macos", "category": "process"}],
            engine=mock_engine,
            r=mock_redis,
            rule_version="v12345678",
            semaphore=mock_semaphore,
        )

    assert result == 0
    mock_engine.evaluate.assert_called_once()
    mock_redis.set.assert_called_once()  # Idempotency key was set
    call_args = mock_redis.set.call_args
    assert "refresh:v12345678:batch-0" in call_args[0]
