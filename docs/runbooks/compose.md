# Docker Compose Runbook

## Prerequisites

- Docker Desktop installed and running
- Ports 8443 (backend), 8080 (dashboard), 6379 (Redis) available

## Quick Start

From the project root:

```bash
docker compose up --build
```

This starts all services:

| Service | URL | Health Check |
|---------|-----|-------------|
| Backend (FastAPI) | http://localhost:8443 | `curl http://localhost:8443/health` |
| Dashboard (React + nginx) | http://localhost:8080 | Open in browser |
| Redis | localhost:6379 | `docker compose exec redis redis-cli ping` |
| Notifier Worker | (no port) | Check logs: `docker compose logs notifier` |

## Setting a Fixed API Key

Create a `.env` file in the project root:

```
HOMESOC_API_KEY=your-secret-key-here
```

If not set, the backend auto-generates a random key on each startup (printed in logs).

## Verifying Services

### 1. Check all services are healthy

```bash
docker compose ps
```

All services should show `healthy` or `running` status.

### 2. Verify backend health

```bash
curl -s http://localhost:8443/health | python3 -m json.tool
```

### 3. Verify rate-limit headers

```bash
curl -sI http://localhost:8443/health | grep -i "x-ratelimit"
```

You should see `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` headers.

### 4. Verify Redis connectivity

```bash
docker compose exec redis redis-cli ping
# Expected: PONG
```

### 5. Verify notifier worker

```bash
docker compose logs notifier --tail 20
# Should show: "Notifier worker started, listening on homesoc:alerts:pending"
```

## Generating Test Data

With the backend running, use the test event generator:

```bash
python scripts/generate_test_events.py --api-key <your-key> --count 50
```

Or from inside the backend container:

```bash
docker compose exec backend python /app/scripts/generate_test_events.py --api-key <your-key>
```

## Running Tests

```bash
# From project root, with venv activated
PYTHONPATH=. python -m pytest tests/ -v
```

### Schemathesis (API fuzz testing)

```bash
pip install schemathesis
schemathesis run http://localhost:8443/openapi.json
```

## Stopping Services

```bash
docker compose down
```

To also remove the persistent data volume:

```bash
docker compose down -v
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "port already in use" | Stop conflicting services or change ports in `compose.yaml` |
| Backend can't connect to Redis | Ensure Redis service is running: `docker compose ps redis` |
| Dashboard shows "connection refused" | Backend may still be starting — wait a few seconds and refresh |
| "Docker daemon not running" | Open Docker Desktop and wait for it to fully start |
