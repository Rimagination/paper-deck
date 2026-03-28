# PaperDeck - Hugging Face Spaces Deployment

# Stage 1: Build frontend
FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm ci --no-audit --no-fund

COPY frontend/ ./
RUN npm run build

# Stage 2: Python backend with frontend static files
FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    nginx \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt /app/backend/
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r /app/backend/requirements.txt

COPY backend/ /app/backend/

COPY --from=frontend-builder /app/frontend/dist /usr/share/nginx/html

COPY nginx-hf.conf /etc/nginx/conf.d/default.conf
RUN rm -f /etc/nginx/sites-enabled/default

COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh

RUN mkdir -p /var/log/supervisor /var/run

ENV PYTHONPATH=/app
ENV PORT=7860
ENV REDIS_URL=""

EXPOSE 7860

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=5 \
    CMD curl -f http://localhost:7860/health || exit 1

CMD ["/app/start.sh"]
