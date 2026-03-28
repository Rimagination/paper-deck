#!/bin/bash

echo "========================================"
echo "Starting PaperDeck"
echo "========================================"

export PYTHONPATH=/app
export PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin

echo "[1/5] Checking Python..."
python --version

echo "[2/5] Checking uvicorn..."
which uvicorn

echo "[3/5] Checking nginx..."
/usr/sbin/nginx -v

echo "[4/5] Starting backend on port 8000..."
cd /app
uvicorn backend.main:app --host 0.0.0.0 --port 8000 --log-level info &
BACKEND_PID=$!
echo "Backend PID: $BACKEND_PID"

echo "[5/5] Waiting for backend to be ready..."
MAX_RETRIES=30
RETRY_COUNT=0
while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if curl -s http://localhost:8000/health > /dev/null 2>&1; then
        echo "Backend is ready!"
        break
    fi
    RETRY_COUNT=$((RETRY_COUNT + 1))
    echo "Waiting for backend... ($RETRY_COUNT/$MAX_RETRIES)"
    sleep 2
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    echo "Backend failed to start!"
    kill $BACKEND_PID 2>/dev/null
    exit 1
fi

echo "Starting nginx..."
/usr/sbin/nginx -g 'daemon off;'
