"""Collector that streams events from macOS eslogger (Endpoint Security framework).

Requires: sudo privileges and Full Disk Access TCC authorization.
Subscribes to specific ES event types and normalizes them into NormalizedEvent dicts.
"""

from __future__ import annotations

import asyncio
import json
import os
from datetime import datetime, timezone
from typing import Callable, Coroutine

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from agents.common.base_agent import BaseCollector
from shared.enums import EventCategory, Platform, Severity

# Maps user-facing toggle keys to the eslogger event types they cover.
# If a group is disabled in config, events of those types are dropped at normalize time.
EVENT_GROUP_MAP: dict[str, list[str]] = {
    "process_exec":        ["exec"],
    "file_events":         ["create", "rename"],
    "file_deletion":       ["unlink"],
    "auth":                ["authentication"],
    "sudo_su":             ["sudo", "su"],
    "ssh":                 ["openssh_login", "openssh_logout"],
    "privilege_escalation":["setuid", "setgid"],
    "process_injection":   ["remote_thread_create", "get_task"],
    "kernel_extensions":   ["kextload", "kextunload"],
    "volume_mounts":       ["mount", "unmount"],
    "screen_sharing":      ["screensharing_attach"],
    "malware_detection":   ["xp_malware_detected", "xp_malware_remediated"],
    "process_signals":     ["signal"],
}

# Reverse map: eslogger event type → group key
_ES_TYPE_TO_GROUP: dict[str, str] = {
    es_type: group
    for group, es_types in EVENT_GROUP_MAP.items()
    for es_type in es_types
}

# Event types to subscribe to.
# NOTE: "open" is intentionally excluded — it fires thousands of times per second
# on a normal Mac (every file read) and creates too much noise/load.
SUBSCRIBED_EVENTS = [
    # Process
    "exec",
    "signal",
    "remote_thread_create",
    "get_task",
    "setuid",
    "setgid",
    # File (write/delete ops only — not read/open)
    "create",
    "rename",
    "unlink",
    # Auth / privilege
    "authentication",
    "sudo",
    "su",
    "openssh_login",
    "openssh_logout",
    # System
    "kextload",
    "kextunload",
    "mount",
    "unmount",
    "screensharing_attach",
    "xp_malware_detected",
    "xp_malware_remediated",
]

# Paths to filter out (high-volume, low-value system noise)
FILTERED_PATH_PREFIXES = [
    "/usr/libexec/",
    "/private/var/folders/",
    "/System/Library/PrivateFrameworks/",
    "/Library/Apple/System/",
    "/usr/sbin/syslogd",
    "/usr/libexec/logd",
    "/Applications/Visual Studio Code.app/",
    "/opt/homebrew/Cellar/redis/",
]

# File-path-specific noise (for create/rename/delete events)
FILTERED_FILE_PATHS = [
    "/Library/Caches/",
    "Library/Application Support/Code/",
    ".git/index.lock",
]

FILTERED_PROCESS_NAMES = [
    "mdworker_shared",
    "mds_stores",
    "mds",
    "fseventsd",
    "distnoted",
    "cfprefsd",
    "launchservicesd",
    "redis-server",
    "Code Helper (Plugin)",
    "Code Helper (Renderer)",
    "Code Helper",
    "electron",
]

# Filesystem types that indicate external/removable media
REMOVABLE_FS_TYPES = {"msdos", "exfat", "ntfs", "udf", "cd9660", "hfs"}


class EsloggerCollector(BaseCollector):
    """Streams eslogger output and normalizes events."""

    def __init__(self, agent_id: str, event_types: list[str] | None = None) -> None:
        super().__init__(agent_id)
        self.event_types = event_types or SUBSCRIBED_EVENTS
        self._process: asyncio.subprocess.Process | None = None
        # Groups that are explicitly disabled — populated from heartbeat config
        self._disabled_groups: set[str] = set()

    def apply_config(self, config: dict) -> None:
        """Apply collector config received from backend heartbeat response."""
        groups = config.get("event_groups", {})
        new_disabled = {group for group, enabled in groups.items() if not enabled}
        if new_disabled == self._disabled_groups:
            return
        self._disabled_groups = new_disabled
        if self._disabled_groups:
            print(f"[EsloggerCollector] Disabled groups: {', '.join(sorted(self._disabled_groups))}")
        else:
            print("[EsloggerCollector] All groups enabled")

    def _is_noisy_file_path(self, path: str) -> bool:
        if path.startswith("/private/var/folders/"):
            return True
        for fragment in FILTERED_FILE_PATHS:
            if fragment in path:
                return True
        return False

    def _is_group_disabled(self, es_event_type: str) -> bool:
        if not self._disabled_groups:
            return False
        group = _ES_TYPE_TO_GROUP.get(es_event_type)
        return group in self._disabled_groups

    async def _drain_stderr(self) -> None:
        """Read and print stderr from eslogger so the pipe never blocks."""
        if self._process is None or self._process.stderr is None:
            return
        async for line in self._process.stderr:
            msg = line.decode("utf-8", errors="replace").strip()
            if msg:
                print(f"[EsloggerCollector] stderr: {msg}", flush=True)

    async def start(self, event_callback: Callable[[dict], Coroutine]) -> None:
        self._running = True
        cmd = ["eslogger", "--format", "json"] + self.event_types

        print(f"[EsloggerCollector] Starting: {' '.join(cmd)}", flush=True)
        print(f"[EsloggerCollector] Note: requires sudo and Full Disk Access", flush=True)

        try:
            self._process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
        except PermissionError:
            print("[EsloggerCollector] Permission denied. Run with sudo.", flush=True)
            return
        except FileNotFoundError:
            print("[EsloggerCollector] eslogger not found. Requires macOS 13+.", flush=True)
            return

        if self._process.stdout is None:
            print("[EsloggerCollector] Failed to capture stdout from eslogger process", flush=True)
            return

        print(f"[EsloggerCollector] Process started (PID {self._process.pid}), waiting for events...", flush=True)

        # Consume stderr in the background so it never blocks stdout
        stderr_task = asyncio.create_task(self._drain_stderr())

        try:
            async for line in self._process.stdout:
                if not self._running:
                    break

                line_str = line.decode("utf-8", errors="replace").strip()
                if not line_str:
                    continue

                try:
                    raw_event = json.loads(line_str)
                except json.JSONDecodeError:
                    print(f"[EsloggerCollector] JSON parse error on: {line_str[:120]}", flush=True)
                    continue

                normalized = self._normalize(raw_event)
                if normalized is not None:
                    await event_callback(normalized)
        finally:
            stderr_task.cancel()
            try:
                await stderr_task
            except asyncio.CancelledError:
                pass

    async def stop(self) -> None:
        self._running = False
        if self._process:
            self._process.terminate()
            await self._process.wait()

    def _normalize(self, raw: dict) -> dict | None:
        """Convert eslogger JSON to a NormalizedEvent dict."""
        # eslogger outputs event_type as a numeric ID on macOS 14+.
        # The reliable source of the type name is the key inside the "event" dict.
        event_data_keys = raw.get("event", {})
        event_type = next(iter(event_data_keys), "") or str(raw.get("event_type", ""))

        # Drop event if its group is disabled in config
        if self._is_group_disabled(event_type):
            return None
        process_info = raw.get("process", {})
        executable = process_info.get("executable", {})
        exec_path = executable.get("path", "")
        process_name = os.path.basename(exec_path)

        # Filter noise — only for process-originating events
        if event_type not in ("kextload", "kextunload", "mount", "unmount",
                               "xp_malware_detected", "xp_malware_remediated",
                               "screensharing_attach", "openssh_login", "openssh_logout"):
            if process_name in FILTERED_PROCESS_NAMES:
                return None
            for prefix in FILTERED_PATH_PREFIXES:
                if exec_path.startswith(prefix):
                    return None

        # Common process fields (used by most events)
        base = {
            "agent_id": self.agent_id,
            "platform": Platform.MACOS.value,
            "source": "eslogger",
            "timestamp": self._extract_timestamp(raw),
            "process_name": process_name,
            "process_pid": process_info.get("audit_token", {}).get("pid"),
            "process_ppid": process_info.get("ppid"),
            "process_path": exec_path,
            "process_user": str(process_info.get("audit_token", {}).get("euid", "")),
            "raw": raw,
        }

        # Route by event type
        if event_type == "exec":
            return self._normalize_exec(raw, base)
        elif event_type in ("open", "create", "rename"):
            return self._normalize_file(raw, base, event_type)
        elif event_type == "unlink":
            return self._normalize_unlink(raw, base)
        elif event_type == "authentication":
            return self._normalize_auth(raw, base)
        elif event_type == "signal":
            return self._normalize_signal(raw, base)
        elif event_type == "remote_thread_create":
            return self._normalize_remote_thread(raw, base)
        elif event_type == "get_task":
            return self._normalize_get_task(raw, base)
        elif event_type in ("setuid", "setgid"):
            return self._normalize_setuid(raw, base, event_type)
        elif event_type == "sudo":
            return self._normalize_sudo(raw, base)
        elif event_type == "su":
            return self._normalize_su(raw, base)
        elif event_type == "openssh_login":
            return self._normalize_ssh_login(raw, base)
        elif event_type == "openssh_logout":
            return self._normalize_ssh_logout(raw, base)
        elif event_type in ("kextload", "kextunload"):
            return self._normalize_kext(raw, base, event_type)
        elif event_type in ("mount", "unmount"):
            return self._normalize_mount(raw, base, event_type)
        elif event_type == "screensharing_attach":
            return self._normalize_screensharing(raw, base)
        elif event_type == "xp_malware_detected":
            return self._normalize_malware_detected(raw, base)
        elif event_type == "xp_malware_remediated":
            return self._normalize_malware_remediated(raw, base)

        return None

    # ── Existing normalizers ────────────────────────────────────────────────

    def _normalize_exec(self, raw: dict, base: dict) -> dict:
        event_data = raw.get("event", {})
        target = event_data.get("exec", {}).get("target", {})
        target_exe = target.get("executable", {})
        target_path = target_exe.get("path", "")

        args = []
        for arg in event_data.get("exec", {}).get("args", []):
            if isinstance(arg, str):
                args.append(arg)

        severity = Severity.INFO.value
        if any(s in target_path.lower() for s in ["/tmp/", "/downloads/", "/var/tmp/"]):
            severity = Severity.MEDIUM.value

        return {
            **base,
            "category": EventCategory.PROCESS.value,
            "event_type": "process_exec",
            "severity": severity,
            "process_name": os.path.basename(target_path),
            "process_path": target_path,
            "process_args": args[:20],
        }

    def _normalize_file(self, raw: dict, base: dict, es_event_type: str) -> dict | None:
        event_data = raw.get("event", {})
        file_info = event_data.get(es_event_type, {})

        file_path = ""
        if es_event_type == "open":
            file_path = file_info.get("file", {}).get("path", "")
        elif es_event_type == "create":
            dest = file_info.get("destination", {})
            if isinstance(dest, dict):
                file_path = dest.get("existing_file", {}).get("path", "")
                if not file_path:
                    new_path = dest.get("new_path", {})
                    dir_path = new_path.get("dir", {}).get("path", "")
                    filename = new_path.get("filename", "")
                    file_path = f"{dir_path}/{filename}" if dir_path else filename
        elif es_event_type == "rename":
            file_path = file_info.get("source", {}).get("path", "")

        if not file_path:
            return None
        if self._is_noisy_file_path(file_path):
            return None

        return {
            **base,
            "category": EventCategory.FILE.value,
            "event_type": f"file_{es_event_type}",
            "severity": Severity.INFO.value,
            "file_path": file_path,
            "file_action": es_event_type,
        }

    def _normalize_auth(self, raw: dict, base: dict) -> dict:
        event_data = raw.get("event", {})
        auth_data = event_data.get("authentication", {})
        success = auth_data.get("success", False)
        auth_type = auth_data.get("type", "unknown")
        severity = Severity.INFO.value if success else Severity.MEDIUM.value

        return {
            **base,
            "category": EventCategory.AUTHENTICATION.value,
            "event_type": "auth_attempt",
            "severity": severity,
            "auth_user": base.get("process_user"),
            "auth_method": auth_type,
            "auth_success": success,
        }

    def _normalize_signal(self, raw: dict, base: dict) -> dict:
        event_data = raw.get("event", {})
        signal_data = event_data.get("signal", {})
        sig = signal_data.get("sig", 0)

        return {
            **base,
            "category": EventCategory.PROCESS.value,
            "event_type": "process_signal",
            "severity": Severity.LOW.value if sig == 9 else Severity.INFO.value,
        }

    # ── New normalizers ─────────────────────────────────────────────────────

    def _normalize_unlink(self, raw: dict, base: dict) -> dict | None:
        """File deletion."""
        event_data = raw.get("event", {})
        target = event_data.get("unlink", {}).get("target", {})
        file_path = target.get("path", "")
        if not file_path or self._is_noisy_file_path(file_path):
            return None

        # Higher severity for deletions in sensitive locations
        severity = Severity.INFO.value
        sensitive = ["/etc/", "/Library/LaunchAgents/", "/Library/LaunchDaemons/",
                     "/System/", "/usr/local/bin/"]
        if any(file_path.startswith(s) for s in sensitive):
            severity = Severity.MEDIUM.value

        return {
            **base,
            "category": EventCategory.FILE.value,
            "event_type": "file_delete",
            "severity": severity,
            "file_path": file_path,
            "file_action": "delete",
        }

    def _normalize_remote_thread(self, raw: dict, base: dict) -> dict:
        """Thread created in a different process — code injection indicator."""
        event_data = raw.get("event", {})
        target = event_data.get("remote_thread_create", {}).get("target", {})
        target_path = target.get("executable", {}).get("path", "")

        return {
            **base,
            "category": EventCategory.PROCESS.value,
            "event_type": "remote_thread_create",
            "severity": Severity.CRITICAL.value,
            "file_path": target_path,  # target process binary
        }

    def _normalize_get_task(self, raw: dict, base: dict) -> dict:
        """Process obtained task port of another process — inspection/injection."""
        event_data = raw.get("event", {})
        target = event_data.get("get_task", {}).get("target", {})
        target_path = target.get("executable", {}).get("path", "")
        target_pid = target.get("audit_token", {}).get("pid")

        return {
            **base,
            "category": EventCategory.PROCESS.value,
            "event_type": "task_inspect",
            "severity": Severity.HIGH.value,
            "file_path": target_path,
            "process_pid": target_pid,
        }

    def _normalize_setuid(self, raw: dict, base: dict, es_event_type: str) -> dict:
        """Privilege escalation via setuid/setgid."""
        event_data = raw.get("event", {})
        data = event_data.get(es_event_type, {})
        new_id = data.get("uid", data.get("gid", 0))

        # Setting to root (0) is the classic privilege escalation
        severity = Severity.CRITICAL.value if new_id == 0 else Severity.HIGH.value

        return {
            **base,
            "category": EventCategory.PROCESS.value,
            "event_type": "privilege_escalation",
            "severity": severity,
            "auth_user": str(new_id),
            "auth_method": es_event_type,
            "auth_success": True,
        }

    def _normalize_sudo(self, raw: dict, base: dict) -> dict:
        """sudo command executed."""
        event_data = raw.get("event", {})
        sudo_data = event_data.get("sudo", {})
        accepted = sudo_data.get("accept", False)
        command = sudo_data.get("command", "")
        from_uid = sudo_data.get("from_uid", "")
        to_uid = sudo_data.get("to_uid", 0)

        severity = Severity.MEDIUM.value if accepted else Severity.HIGH.value

        return {
            **base,
            "category": EventCategory.AUTHENTICATION.value,
            "event_type": "sudo_command",
            "severity": severity,
            "auth_user": str(from_uid),
            "auth_method": "sudo",
            "auth_success": accepted,
            "process_args": [command] if command else None,
        }

    def _normalize_su(self, raw: dict, base: dict) -> dict:
        """su command — user switching."""
        event_data = raw.get("event", {})
        su_data = event_data.get("su", {})
        success = su_data.get("success", False)
        from_user = su_data.get("from_username", "")
        to_user = su_data.get("to_username", "root")

        severity = Severity.MEDIUM.value if success else Severity.HIGH.value

        return {
            **base,
            "category": EventCategory.AUTHENTICATION.value,
            "event_type": "su_command",
            "severity": severity,
            "auth_user": from_user,
            "auth_method": f"su to {to_user}",
            "auth_success": success,
        }

    def _normalize_ssh_login(self, raw: dict, base: dict) -> dict:
        """Inbound SSH login attempt."""
        event_data = raw.get("event", {})
        ssh_data = event_data.get("openssh_login", {})
        success = ssh_data.get("success", False)
        source_addr = ssh_data.get("source_address", "")
        username = ssh_data.get("username", "")
        auth_type = ssh_data.get("auth_type", "unknown")

        severity = Severity.LOW.value if success else Severity.HIGH.value

        return {
            **base,
            "category": EventCategory.AUTHENTICATION.value,
            "event_type": "ssh_login",
            "severity": severity,
            "auth_user": username,
            "auth_method": f"ssh/{auth_type}",
            "auth_success": success,
            "src_ip": source_addr,
        }

    def _normalize_ssh_logout(self, raw: dict, base: dict) -> dict:
        """SSH session ended."""
        event_data = raw.get("event", {})
        ssh_data = event_data.get("openssh_logout", {})
        source_addr = ssh_data.get("source_address", "")
        username = ssh_data.get("username", "")

        return {
            **base,
            "category": EventCategory.AUTHENTICATION.value,
            "event_type": "ssh_logout",
            "severity": Severity.INFO.value,
            "auth_user": username,
            "auth_method": "ssh",
            "auth_success": True,
            "src_ip": source_addr,
        }

    def _normalize_kext(self, raw: dict, base: dict, es_event_type: str) -> dict:
        """Kernel extension loaded or unloaded."""
        event_data = raw.get("event", {})
        kext_data = event_data.get(es_event_type, {})
        identifier = kext_data.get("identifier", "")

        # Non-Apple kexts are unusual and worth flagging
        is_apple = identifier.startswith("com.apple.")
        severity = Severity.LOW.value if is_apple else Severity.HIGH.value

        return {
            **base,
            "category": EventCategory.SYSTEM.value,
            "event_type": es_event_type,  # kextload / kextunload
            "severity": severity,
            "file_path": identifier,  # bundle ID as identifier
        }

    def _normalize_mount(self, raw: dict, base: dict, es_event_type: str) -> dict:
        """Volume mounted or unmounted — highlights removable media."""
        event_data = raw.get("event", {})
        mount_data = event_data.get(es_event_type, {})
        statfs = mount_data.get("statfs", {})
        mount_point = statfs.get("f_mntonname", "")
        mount_from = statfs.get("f_mntfromname", "")
        fs_type = statfs.get("f_fstypename", "").lower()

        # External/removable media gets medium severity
        is_external = fs_type in REMOVABLE_FS_TYPES or "/Volumes/" in mount_point
        severity = Severity.MEDIUM.value if is_external else Severity.INFO.value

        label = "volume_mount" if es_event_type == "mount" else "volume_unmount"
        detail = mount_point or mount_from

        return {
            **base,
            "category": EventCategory.SYSTEM.value,
            "event_type": label,
            "severity": severity,
            "file_path": detail,  # what was mounted / where
        }

    def _normalize_screensharing(self, raw: dict, base: dict) -> dict:
        """Screen sharing session attached."""
        event_data = raw.get("event", {})
        ss_data = event_data.get("screensharing_attach", {})
        success = ss_data.get("success", False)
        source_addr = ss_data.get("source_address", "")
        auth_type = ss_data.get("authentication_type", "unknown")
        username = ss_data.get("authentication_username", "")

        severity = Severity.HIGH.value if success else Severity.MEDIUM.value

        return {
            **base,
            "category": EventCategory.SYSTEM.value,
            "event_type": "screensharing_attach",
            "severity": severity,
            "auth_user": username,
            "auth_method": auth_type,
            "auth_success": success,
            "src_ip": source_addr,
        }

    def _normalize_malware_detected(self, raw: dict, base: dict) -> dict:
        """XProtect detected malware."""
        event_data = raw.get("event", {})
        xp_data = event_data.get("xp_malware_detected", {})
        malware_id = xp_data.get("malware_identifier", "unknown")
        action = xp_data.get("action_taken", "")

        return {
            **base,
            "category": EventCategory.SYSTEM.value,
            "event_type": "malware_detected",
            "severity": Severity.CRITICAL.value,
            "file_path": malware_id,
            "process_args": [action] if action else None,
        }

    def _normalize_malware_remediated(self, raw: dict, base: dict) -> dict:
        """XProtect remediated (removed) malware."""
        event_data = raw.get("event", {})
        xp_data = event_data.get("xp_malware_remediated", {})
        malware_id = xp_data.get("malware_identifier", "unknown")
        action = xp_data.get("action_taken", "")

        return {
            **base,
            "category": EventCategory.SYSTEM.value,
            "event_type": "malware_remediated",
            "severity": Severity.HIGH.value,
            "file_path": malware_id,
            "process_args": [action] if action else None,
        }

    def _extract_timestamp(self, raw: dict) -> str:
        time_field = raw.get("time")
        if isinstance(time_field, (int, float)):
            return datetime.fromtimestamp(time_field, tz=timezone.utc).isoformat()
        if isinstance(time_field, dict):
            secs = time_field.get("seconds", 0)
            nsecs = time_field.get("nanoseconds", 0)
            if secs:
                ts = secs + nsecs / 1_000_000_000
                return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()
        return datetime.now(timezone.utc).isoformat()
