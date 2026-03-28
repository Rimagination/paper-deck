# PaperDeck - Hugging Face Spaces Deployment
# Single-process: uvicorn serves both API and pre-built frontend.

FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt /app/backend/
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r /app/backend/requirements.txt

COPY backend/ /app/backend/
COPY frontend/dist /app/frontend/dist

ENV PYTHONPATH=/app
ENV PORT=7860
ENV REDIS_URL=""

EXPOSE 7860

HEALTHCHECK --interval=10s --timeout=3s --start-period=30s --retries=5 \
    CMD curl -f http://localhost:7860/health || exit 1

CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "7860", "--log-level", "info"]
