# PaperDeck - Hugging Face Spaces Deployment
# Multi-stage build: compile the frontend from source, then serve it from FastAPI.

FROM node:20-slim AS frontend-build

WORKDIR /frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim

WORKDIR /app

ENV PYTHONPATH=/app \
    PORT=7860 \
    REDIS_URL="" \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

COPY backend/requirements.txt /app/backend/
RUN pip install -r /app/backend/requirements.txt

COPY backend/ /app/backend/
COPY --from=frontend-build /frontend/dist /app/frontend/dist

EXPOSE 7860

HEALTHCHECK --interval=10s --timeout=3s --start-period=30s --retries=5 \
    CMD python -c "import sys, urllib.request; urllib.request.urlopen('http://127.0.0.1:7860/health', timeout=2); sys.exit(0)"

CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "7860", "--log-level", "info"]
