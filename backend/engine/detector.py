"""Detection engine — matches events against loaded rules and generates alerts."""

from __future__ import annotations

import fnmatch
import uuid
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any

from .rules_loader import load_rules


class DetectionEngine:
    """Processes events through detection rules, generates alerts."""

    def __init__(self, rules_dir: str) -> None:
        self.rules = load_rules(rules_dir)
        self.single_rules = [r for r in self.rules if r.get("type") == "single"]
        self.threshold_rules = [r for r in self.rules if r.get("type") == "threshold"]

        # Threshold state: (rule_id, group_key) -> list of timestamps
        # group_key is derived from the event to scope counting per-source
        self._threshold_windows: dict[tuple[str, str], list[float]] = defaultdict(list)

    def evaluate(self, event: dict, disabled_rule_ids: set[str] | None = None) -> list[dict]:
        """Evaluate an event against all rules. Returns list of alert dicts."""
        alerts = []
        disabled = disabled_rule_ids or set()

        for rule in self.single_rules:
            if rule["id"] in disabled:
                continue
            if self._match_single(rule, event):
                alerts.append(self._create_alert(rule, event))

        for rule in self.threshold_rules:
            if rule["id"] in disabled:
                continue
            alert = self._check_threshold(rule, event)
            if alert:
                alerts.append(alert)

        return alerts

    def _match_single(self, rule: dict, event: dict) -> bool:
        """Check if an event matches a single-event rule."""
        conditions = rule.get("conditions", {})

        # Platform filter
        rule_platform = rule.get("platform")
        if rule_platform and event.get("platform") != rule_platform:
            return False

        # Direct field matching
        for field in ("category", "event_type"):
            if field in conditions and event.get(field) != conditions[field]:
                return False

        # match: exact field matching
        match_conditions = conditions.get("match", {})
        for field, expected in match_conditions.items():
            if event.get(field) != expected:
                return False

        # match_any: value must be in the list
        match_any = conditions.get("match_any", {})
        for field, values in match_any.items():
            if event.get(field) not in values:
                return False

        # not_match: value must NOT be in the list
        not_match = conditions.get("not_match", {})
        for field, values in not_match.items():
            if event.get(field) in values:
                return False

        # match_any_prefix: value must start with one of the prefixes
        match_any_prefix = conditions.get("match_any_prefix", {})
        for field, prefixes in match_any_prefix.items():
            val = event.get(field, "")
            if not val or not any(
                fnmatch.fnmatch(val, p) if "*" in p else val.startswith(p)
                for p in prefixes
            ):
                return False

        # not_match_prefix: value must NOT start with any prefix
        not_match_prefix = conditions.get("not_match_prefix", {})
        for field, prefixes in not_match_prefix.items():
            val = event.get(field, "")
            if val and any(val.startswith(p) for p in prefixes):
                return False

        # match_any_contains: value must contain one of the substrings
        match_any_contains = conditions.get("match_any_contains", {})
        for field, substrings in match_any_contains.items():
            val = event.get(field, "")
            if not val or not any(s in val for s in substrings):
                return False

        return True

    @staticmethod
    def _threshold_group_key(rule: dict, event: dict) -> str:
        """Build a grouping key so threshold counting is per-source, not global.

        Groups by agent_id + the most relevant identity field for the rule's
        category (e.g., auth_user for auth rules, src_ip for network rules).
        """
        parts = [event.get("agent_id", "")]
        category = rule.get("conditions", {}).get("category", "")
        if category == "auth":
            parts.append(event.get("auth_user") or "")
        elif category == "network":
            parts.append(event.get("src_ip") or "")
        elif category == "process":
            parts.append(event.get("process_user") or "")
        else:
            parts.append(event.get("agent_id") or "")
        return "|".join(parts)

    def _check_threshold(self, rule: dict, event: dict) -> dict | None:
        """Check if event triggers a threshold rule."""
        rule_id = rule["id"]

        # Reuse single-rule matching for base conditions
        if not self._match_single(rule, event):
            return None

        # Event matches — record timestamp scoped to source
        now = datetime.now(timezone.utc).timestamp()
        window = rule.get("window_seconds", 60)
        threshold = rule.get("threshold", 5)
        group_key = self._threshold_group_key(rule, event)
        bucket_key = (rule_id, group_key)

        # Prune old entries FIRST to avoid unbounded growth
        cutoff = now - window
        self._threshold_windows[bucket_key] = [
            ts for ts in self._threshold_windows[bucket_key] if ts > cutoff
        ]

        self._threshold_windows[bucket_key].append(now)

        if len(self._threshold_windows[bucket_key]) >= threshold:
            # Threshold exceeded — fire alert and reset this bucket
            self._threshold_windows[bucket_key].clear()
            return self._create_alert(rule, event)

        return None

    def _create_alert(self, rule: dict, event: dict) -> dict:
        """Create an alert dict from a rule match."""
        return {
            "id": str(uuid.uuid4()),
            "rule_id": rule["id"],
            "rule_name": rule["name"],
            "severity": rule.get("severity", "medium"),
            "title": f"[{rule['severity'].upper()}] {rule['name']}",
            "description": self._format_description(rule, event),
            "event_ids": [event.get("id", "")],
            "status": "open",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }

    def _format_description(self, rule: dict, event: dict) -> str:
        parts = [rule.get("description", "")]
        if event.get("process_name"):
            parts.append(f"Process: {event['process_name']}")
        if event.get("process_path"):
            parts.append(f"Path: {event['process_path']}")
        if event.get("dst_ip"):
            parts.append(f"Destination: {event['dst_ip']}:{event.get('dst_port', '?')}")
        if event.get("file_path"):
            parts.append(f"File: {event['file_path']}")
        return " | ".join(parts)
