#!/usr/bin/env python3
"""Seed the backend with realistic events that trigger known detection rules."""
import argparse
import json
import urllib.request
import urllib.error
from datetime import datetime, timezone

AGENT_ID = "seed-agent"


def ts() -> str:
    return datetime.now(timezone.utc).isoformat()


EVENTS = [
    # triggers: Reconnaissance Tool (HIGH)
    {
        "timestamp": ts(), "agent_id": AGENT_ID,
        "category": "process", "event_type": "exec", "severity": "medium",
        "process_name": "nmap", "process_path": "/usr/local/bin/nmap",
        "process_args": ["-sS", "192.168.1.0/24"],
    },
    # triggers: Suspicious Shell Spawn (HIGH) — bash from python3
    {
        "timestamp": ts(), "agent_id": AGENT_ID,
        "category": "process", "event_type": "exec", "severity": "medium",
        "process_name": "bash", "process_path": "/bin/bash",
        "process_args": ["-i"],
        "parent_process": "python3",
    },
    # triggers: LaunchDaemon Created (HIGH)
    {
        "timestamp": ts(), "agent_id": AGENT_ID,
        "category": "file", "event_type": "create", "severity": "medium",
        "file_path": "/Library/LaunchDaemons/com.backdoor.plist",
    },
    # triggers: Known C2 Port (CRITICAL)
    {
        "timestamp": ts(), "agent_id": AGENT_ID,
        "category": "network", "event_type": "connection", "severity": "medium",
        "process_name": "nc", "dst_ip": "10.0.0.99", "dst_port": 4444,
    },
    # benign: SSH login success
    {
        "timestamp": ts(), "agent_id": AGENT_ID,
        "category": "auth", "event_type": "ssh_login", "severity": "info",
        "auth_user": "admin", "auth_success": True,
        "process_name": "sshd",
    },
    # benign: sudo command
    {
        "timestamp": ts(), "agent_id": AGENT_ID,
        "category": "auth", "event_type": "sudo_command", "severity": "info",
        "auth_user": "gal", "auth_success": True,
        "process_args": ["apt", "update"],
    },
    # benign: normal process
    {
        "timestamp": ts(), "agent_id": AGENT_ID,
        "category": "process", "event_type": "exec", "severity": "info",
        "process_name": "vim", "process_path": "/usr/bin/vim",
    },
    # benign: normal file write
    {
        "timestamp": ts(), "agent_id": AGENT_ID,
        "category": "file", "event_type": "create", "severity": "info",
        "file_path": "/Users/gal/Documents/notes.txt",
    },
    # benign: normal outbound HTTPS
    {
        "timestamp": ts(), "agent_id": AGENT_ID,
        "category": "network", "event_type": "connection", "severity": "info",
        "process_name": "curl", "dst_ip": "1.1.1.1", "dst_port": 443,
    },
    # triggers: Execution from /tmp (MEDIUM)
    {
        "timestamp": ts(), "agent_id": AGENT_ID,
        "category": "process", "event_type": "exec", "severity": "medium",
        "process_name": "payload", "process_path": "/tmp/payload",
    },
]


def main():
    parser = argparse.ArgumentParser(description="Seed HomeSoc with realistic events.")
    parser.add_argument("--api-key", required=True)
    parser.add_argument("--backend-url", default="http://localhost:8443")
    args = parser.parse_args()

    payload = json.dumps({"events": EVENTS, "agent_id": AGENT_ID}).encode()
    req = urllib.request.Request(
        f"{args.backend_url}/api/v1/events",
        data=payload,
        headers={"Content-Type": "application/json", "X-API-Key": args.api_key},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req) as resp:
            result = json.loads(resp.read())
        print(f"Seeded {result.get('accepted', len(EVENTS))} events → {result.get('alerts_triggered', 0)} alerts triggered.")
    except urllib.error.HTTPError as e:
        print(f"Error {e.code}: {e.read().decode()}")


if __name__ == "__main__":
    main()
