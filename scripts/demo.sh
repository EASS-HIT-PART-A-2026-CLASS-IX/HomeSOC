#!/usr/bin/env bash
# HomeSOC Demo Script
# Walks through the full system: backend, dashboard, test events, and key features.
#
# Usage:
#   ./scripts/demo.sh
#
# Prerequisites:
#   - Python venv activated (source .venv/bin/activate)
#   - Node modules installed (cd dashboard && npm install)

set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Colors
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${CYAN}[demo]${NC} $1"; }
step()  { echo -e "\n${GREEN}=== $1 ===${NC}"; }
warn()  { echo -e "${YELLOW}[demo]${NC} $1"; }

cleanup() {
    info "Shutting down..."
    [ -n "$BACKEND_PID" ] && kill "$BACKEND_PID" 2>/dev/null || true
    [ -n "$DASHBOARD_PID" ] && kill "$DASHBOARD_PID" 2>/dev/null || true
    info "Done."
}
trap cleanup EXIT

# ── Step 1: Start Backend ───────────────────────────────────────────────

step "Starting Backend (FastAPI on port 8443)"

cd "$ROOT/backend"
python -m uvicorn main:app --host 0.0.0.0 --port 8443 > /tmp/homesoc-demo-backend.log 2>&1 &
BACKEND_PID=$!
cd "$ROOT"

# Wait for backend
for i in $(seq 1 15); do
    if curl -sf http://localhost:8443/health > /dev/null 2>&1; then
        break
    fi
    sleep 1
done

if ! curl -sf http://localhost:8443/health > /dev/null 2>&1; then
    warn "Backend failed to start. Check /tmp/homesoc-demo-backend.log"
    exit 1
fi

# Extract API key from logs
API_KEY=$(grep "API Key:" /tmp/homesoc-demo-backend.log | head -1 | sed 's/.*API Key: //')
info "Backend running (PID $BACKEND_PID)"
info "API Key: $API_KEY"

# ── Step 2: Start Dashboard ─────────────────────────────────────────────

step "Starting Dashboard (React on port 5173)"

cd "$ROOT/dashboard"
npm run dev > /tmp/homesoc-demo-dashboard.log 2>&1 &
DASHBOARD_PID=$!
cd "$ROOT"

sleep 4
info "Dashboard running (PID $DASHBOARD_PID)"
info "Open http://localhost:5173 in your browser"

# ── Step 3: Health Check ────────────────────────────────────────────────

step "Verifying Health Check + Rate Limit Headers"

curl -s http://localhost:8443/health | python3 -m json.tool
echo ""
info "Rate-limit headers:"
curl -sD - http://localhost:8443/health -o /dev/null | grep -i "x-ratelimit"

# ── Step 4: Register User & JWT Auth ────────────────────────────────────

step "JWT Authentication Demo"

info "Registering admin user..."
curl -s -X POST http://localhost:8443/api/v1/auth/register \
    -H "Content-Type: application/json" \
    -d '{"username":"demo-admin","password":"demo123","role":"admin"}' | python3 -m json.tool

info "Logging in..."
TOKEN=$(curl -s -X POST http://localhost:8443/api/v1/auth/login \
    -d "username=demo-admin&password=demo123" | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")
info "JWT Token: ${TOKEN:0:40}..."

info "Accessing /auth/me with token..."
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:8443/api/v1/auth/me | python3 -m json.tool

# ── Step 5: Generate Test Events ────────────────────────────────────────

step "Generating Test Events (3 batches of 10)"

python scripts/generate_test_events.py --api-key "$API_KEY" --count 10 --batches 3 --interval 1

# ── Step 6: Query Events & Alerts ───────────────────────────────────────

step "Querying Events"

EVENT_COUNT=$(curl -s "http://localhost:8443/api/v1/events?limit=1000" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")
info "Total events in DB: $EVENT_COUNT"

step "Querying Alerts"

ALERTS=$(curl -s "http://localhost:8443/api/v1/alerts?limit=10")
ALERT_COUNT=$(echo "$ALERTS" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")
info "Open alerts: $ALERT_COUNT"
echo "$ALERTS" | python3 -m json.tool | head -30

# ── Step 7: Dashboard Summary ───────────────────────────────────────────

step "Dashboard Summary"

curl -s http://localhost:8443/api/v1/dashboard/summary | python3 -m json.tool

# ── Step 8: Detection Rules ─────────────────────────────────────────────

step "Detection Rules"

curl -s http://localhost:8443/api/v1/rules | python3 -c "
import sys, json
rules = json.load(sys.stdin)
for r in rules:
    print(f\"  [{r['severity'].upper():8s}] {r['name']} ({r['type']})\")
"

# ── Step 9: Run Tests ───────────────────────────────────────────────────

step "Running Test Suite"

cd "$ROOT"
PYTHONPATH=. python -m pytest tests/ -v --tb=short 2>&1 | tail -20

# ── Done ────────────────────────────────────────────────────────────────

step "Demo Complete"

info "Backend:   http://localhost:8443 (API docs: http://localhost:8443/docs)"
info "Dashboard: http://localhost:5173"
info ""
info "Press Ctrl+C to shut down all services."

# Keep running until user stops
wait
