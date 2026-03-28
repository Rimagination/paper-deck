# PaperDeck - Hugging Face Spaces Deployment
# Frontend is pre-built locally (dist/ committed to repo) to avoid
# slow npm install on HF's build servers (40+ min → 3-5 min).

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
COPY frontend/dist /usr/share/nginx/html

COPY nginx-hf.conf /etc/nginx/conf.d/default.conf
RUN rm -f /etc/nginx/sites-enabled/default

COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh

RUN mkdir -p /var/log/supervisor /var/run

ENV PYTHONPATH=/app
ENV PORT=7860
ENV REDIS_URL=""

EXPOSE 7860

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:7860/health || exit 1

CMD ["/app/start.sh"]
