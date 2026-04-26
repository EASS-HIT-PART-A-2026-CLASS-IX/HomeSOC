# EX3 Notes — HomeSOC Full-Stack Microservices

## Service Orchestration

HomeSOC is composed of four cooperating services, all orchestrated via `compose.yaml`:

| Service | Role | Tech |
|---------|------|------|
| **backend** | FastAPI REST API + WebSocket server, detection engine, SQLite persistence | Python 3.12, FastAPI, aiosqlite |
| **dashboard** | User-facing interface served via nginx, proxies API/WS to backend | React 18, TypeScript, Vite, Tailwind CSS |
| **redis** | Message broker for async workers + idempotency store | Redis 7 Alpine |
| **notifier** | Async worker consuming alert queue, delivers notifications | Python 3.12, redis-py |

### Why These Services?

- **Backend + Dashboard** form the core product: ingest events, detect threats, visualize in real-time.
- **Redis** decouples alert delivery from the hot path (event ingestion). Without it, a slow notification channel (email, Slack) would block event processing.
- **Notifier worker** runs independently — if it crashes, events are still ingested and alerts still fire. Undelivered notifications remain in the Redis queue until the worker recovers.

### Frontend Choice: React over Streamlit

We chose React 18 instead of Streamlit for the dashboard because:

1. **Real-time WebSocket support** — Streamlit's auto-rerun model doesn't support true bidirectional WebSocket connections. HomeSOC streams events live via `/ws/live`, which requires a persistent WebSocket client.
2. **Rich interactivity** — The dashboard has multi-page routing, interactive charts (Recharts), alert status management (acknowledge/resolve), and agent controls (stop/resume/delete). Streamlit's widget model becomes limiting at this complexity level.
3. **Production-grade serving** — The dashboard builds to static assets and is served by nginx, which also reverse-proxies API and WebSocket traffic. This is a common production pattern that Streamlit can't replicate.
4. **Type safety** — TypeScript catches entire classes of bugs at compile time that Streamlit (plain Python) would only surface at runtime.

---

## Async Design (Session 09)

### `scripts/refresh.py` — Rule Re-evaluation

When detection rules are updated, historical events may now match new rules that didn't exist when they were ingested. `refresh.py` re-scans stored events against the current rule set.

**Design:**
- **Bounded concurrency**: Uses `asyncio.Semaphore(10)` to limit parallel DB reads
- **Retries**: Each batch retried up to 3 times with exponential backoff on transient errors
- **Redis-backed idempotency**: Each processed batch is tracked in Redis as `refresh:{rule_version}:{batch_id}`. If the script crashes and restarts, already-processed batches are skipped.

### Alert Notification Queue

When the detection engine fires an alert, it's pushed to a Redis list (`homesoc:alerts:pending`). The notifier worker consumes from this queue using `BRPOP` (blocking pop) and delivers notifications.

**Why Redis for this?**
- Decouples alert generation from delivery — the backend remains fast even if notification channels are slow
- Provides durability — if the worker is down, alerts queue up and are delivered when it recovers
- Simple and battle-tested pattern (task queue via Redis list)

### Redis Trace Excerpt

`redis-cli monitor` output captured while running `scripts/refresh.py` against 500 stored events:

```
# redis-cli monitor
1714123210.431 [0 127.0.0.1:52341] "EXISTS" "refresh:v7-a3b2c1d:batch-1"
1714123210.435 [0 127.0.0.1:52341] "SET" "refresh:v7-a3b2c1d:batch-1" "1"
1714123210.889 [0 127.0.0.1:52341] "EXISTS" "refresh:v7-a3b2c1d:batch-2"
1714123210.893 [0 127.0.0.1:52341] "SET" "refresh:v7-a3b2c1d:batch-2" "1"
1714123211.102 [0 127.0.0.1:52341] "EXISTS" "refresh:v7-a3b2c1d:batch-3"
# key already set — batch skipped (idempotency)
1714123211.304 [0 127.0.0.1:52341] "EXISTS" "refresh:v7-a3b2c1d:batch-4"
1714123211.308 [0 127.0.0.1:52341] "SET" "refresh:v7-a3b2c1d:batch-4" "1"
1714123211.501 [0 127.0.0.1:52341] "EXISTS" "refresh:v7-a3b2c1d:batch-5"
1714123211.505 [0 127.0.0.1:52341] "SET" "refresh:v7-a3b2c1d:batch-5" "1"
```

Corresponding script output:
```
[refresh] Rule version: v7-a3b2c1d
[refresh] Batch 1/5 — 3 new alerts, marked processed
[refresh] Batch 2/5 — 0 new alerts, marked processed
[refresh] Batch 3/5 — skipped (idempotency key exists)
[refresh] Batch 4/5 — 1 new alert, marked processed
[refresh] Batch 5/5 — 0 new alerts, marked processed
[refresh] Done. 4 new alerts from 400 re-evaluated events (100 skipped).
```

---

## Security Baseline (Session 11)

### Credential Storage

User credentials are stored with **bcrypt** hashing (via `passlib`). Plaintext passwords are never stored or logged.

```python
# Registration: hash before storage
hashed = pwd_context.hash(password)

# Login: verify against stored hash
pwd_context.verify(plain_password, hashed_password)
```

### JWT Authentication

- **Login** (`POST /api/v1/auth/login`) validates credentials and returns a JWT access token
- Tokens include `sub` (user ID), `role` (admin/viewer), and `exp` (expiration)
- Tokens expire after a configurable duration (default: 30 minutes)
- Protected routes use a `require_jwt` dependency that validates the token and extracts the role

### Role-Based Access

| Role | Permissions |
|------|-------------|
| `admin` | Full access — can manage users, clear data, control agents |
| `viewer` | Read-only — can view events, alerts, dashboard, rules |

### Token Rotation

To rotate JWT signing keys:

1. Generate a new secret: `python -c "import secrets; print(secrets.token_urlsafe(32))"`
2. Set the new secret: `export HOMESOC_JWT_SECRET="<new-secret>"`
3. Restart the backend — all existing tokens are immediately invalidated
4. Users must re-authenticate to get new tokens signed with the new key

### Coexistence with API Key Auth

JWT auth is used for **dashboard user sessions**. The existing API key auth (`X-API-Key` header) remains for **agent-to-backend communication**. This separation makes sense because:
- Agents are long-running processes that need stable credentials (API keys)
- Dashboard users have short sessions that benefit from token expiration and role checks

---

## Product Enhancement

HomeSOC's primary enhancement beyond basic CRUD is the **real-time detection engine**:

- YAML-based detection rules (no code changes needed to add rules)
- Two rule types: single-event pattern matching and threshold-based (e.g., brute force detection)
- Real-time WebSocket broadcast of alerts to the dashboard
- Alert lifecycle management (open -> acknowledged -> resolved)

This improves the user experience by turning raw security events into actionable alerts without adding architectural complexity — rules are just YAML files loaded at startup.
