#!/bin/bash

echo "========================================"
echo "Starting PaperDeck"
echo "========================================"

export PYTHONPATH=/app
export PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin

echo "[1/4] Starting nginx (serves static files + /health immediately)..."
/usr/sbin/nginx
echo "nginx started (PID $(cat /var/run/nginx.pid 2>/dev/null || echo unknown))"

echo "[2/4] Starting backend on port 8000..."
cd /app
uvicorn backend.main:app --host 0.0.0.0 --port 8000 --log-level info &
BACKEND_PID=$!
echo "Backend PID: $BACKEND_PID"

echo "[3/4] Waiting for backend to be ready..."
MAX_RETRIES=60
RETRY_COUNT=0
while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if curl -s http://localhost:8000/health > /dev/null 2>&1; then
        echo "Backend is ready after ${RETRY_COUNT}s"
        break
    fi
    RETRY_COUNT=$((RETRY_COUNT + 1))
    sleep 2
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    echo "WARNING: Backend did not respond in time, but nginx is up serving static files."
fi

echo "[4/4] Keeping nginx in foreground..."
/usr/sbin/nginx -s reload
wait $BACKEND_PID
