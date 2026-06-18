#!/usr/bin/env bash
set -e

echo "🎭 Starting CrowdShield in DEMO MODE (no backend needed)..."
echo "   All data is bundled — works fully offline."
echo ""

cd app
npm install --silent 2>/dev/null
NEXT_PUBLIC_DEMO_MODE=true npm run dev
