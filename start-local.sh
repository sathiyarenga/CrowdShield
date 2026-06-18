#!/usr/bin/env bash
set -e

echo "🚀 Starting CrowdShield locally..."
echo ""

# Colors
BLUE='\033[0;34m'
GREEN='\033[0;32m'
NC='\033[0m'

# ── Phase 1: Install dependencies (sequentially, before starting servers) ──
echo -e "${BLUE}[backend]${NC} Setting up Python environment..."
(cd backend && python3 -m venv .venv 2>/dev/null || true && .venv/bin/pip install -q -e .)

echo -e "${GREEN}[frontend]${NC} Installing dependencies..."
(cd app && npm install --silent)

echo ""
echo "✅ Dependencies ready. Starting servers..."
echo ""

# ── Phase 2: Start servers (no pip/npm writes to trigger reloads) ──
(cd backend && .venv/bin/uvicorn src.api.main:app --host 0.0.0.0 --port 8000 --reload --reload-exclude '.venv' 2>&1 | sed "s/^/$(printf '\033[0;34m')[backend]$(printf '\033[0m') /") &
BACKEND_PID=$!

(cd app && npm run dev 2>&1 | sed "s/^/$(printf '\033[0;32m')[frontend]$(printf '\033[0m') /") &
FRONTEND_PID=$!

# Trap Ctrl+C to kill both
trap "echo '' && echo '👋 Shutting down...' && kill $BACKEND_PID $FRONTEND_PID 2>/dev/null" EXIT INT TERM

wait
