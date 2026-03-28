#!/bin/bash
set -e

echo "========================================"
echo "Starting PaperDeck"
echo "========================================"

export PYTHONPATH=/app
export PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin

# Start backend in background
echo "Starting uvicorn backend on port 8000..."
cd /app
uvicorn backend.main:app --host 0.0.0.0 --port 8000 --log-level info &
echo "Backend PID: $!"

# nginx in foreground as PID 1 — /health responds immediately (no backend proxy)
echo "Starting nginx on port 7860..."
exec /usr/sbin/nginx -g 'daemon off;'
