#!/bin/bash
set -e

# Kill existing processes on our ports
echo "Cleaning up ports..."
lsof -ti :3010 | xargs kill 2>/dev/null || true
lsof -ti :5173 | xargs kill 2>/dev/null || true

# Build shared package
echo "Building shared package..."
(cd packages/shared && npx tsc)

# Start API and Web in parallel, with colored output
echo ""
echo "Starting Kookos..."
echo "  API  → http://localhost:3010"
echo "  Web  → http://localhost:5173"
echo ""

# Trap to kill both on Ctrl+C
trap 'kill 0; exit' SIGINT SIGTERM

(cd apps/api && npx tsx watch src/index.ts 2>&1 | sed 's/^/[API] /') &
(cd apps/web && npx vite 2>&1 | sed 's/^/[WEB] /') &

wait
