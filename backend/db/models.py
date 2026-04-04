"""SQLite table definitions for HomeSOC."""

CREATE_TABLES = [
    """
    CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        received_at TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        platform TEXT NOT NULL,
        category TEXT NOT NULL,
        event_type TEXT NOT NULL,
        severity TEXT NOT NULL DEFAULT 'info',
        process_name TEXT,
        process_pid INTEGER,
        process_ppid INTEGER,
        process_path TEXT,
        process_user TEXT,
        process_args TEXT,
        process_hash TEXT,
        file_path TEXT,
        file_action TEXT,
        src_ip TEXT,
        src_port INTEGER,
        dst_ip TEXT,
        dst_port INTEGER,
        protocol TEXT,
        dns_query TEXT,
        auth_user TEXT,
        auth_method TEXT,
        auth_success INTEGER,
        raw TEXT,
        source TEXT NOT NULL,
        source_event_id TEXT,
        created_at TEXT DEFAULT (datetime('now'))
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp)",
    "CREATE INDEX IF NOT EXISTS idx_events_category ON events(category)",
    "CREATE INDEX IF NOT EXISTS idx_events_severity ON events(severity)",
    "CREATE INDEX IF NOT EXISTS idx_events_agent ON events(agent_id)",
    "CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type)",
    "CREATE INDEX IF NOT EXISTS idx_events_process_name ON events(process_name)",
    "CREATE INDEX IF NOT EXISTS idx_events_dst_ip ON events(dst_ip)",
    """
    CREATE TABLE IF NOT EXISTS alerts (
        id TEXT PRIMARY KEY,
        rule_id TEXT NOT NULL,
        rule_name TEXT NOT NULL,
        severity TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        event_ids TEXT,
        status TEXT DEFAULT 'open',
        created_at TEXT DEFAULT (datetime('now')),
        resolved_at TEXT
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status)",
    "CREATE INDEX IF NOT EXISTS idx_alerts_severity ON alerts(severity)",
    "CREATE INDEX IF NOT EXISTS idx_alerts_created ON alerts(created_at)",
    """
    CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        hostname TEXT NOT NULL,
        platform TEXT NOT NULL,
        ip_address TEXT,
        version TEXT,
        last_heartbeat TEXT,
        status TEXT DEFAULT 'unknown',
        config TEXT
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        hashed_password TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'viewer',
        created_at TEXT DEFAULT (datetime('now'))
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS detection_rules (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        enabled INTEGER DEFAULT 1,
        severity TEXT NOT NULL,
        category TEXT,
        platform TEXT,
        rule_type TEXT NOT NULL,
        conditions TEXT NOT NULL,
        window_seconds INTEGER,
        threshold INTEGER,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT
    )
    """,
]
