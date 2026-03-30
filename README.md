---
title: PaperDeck
colorFrom: yellow
colorTo: blue
sdk: docker
pinned: false
license: mit
app_port: 7860
---

# PaperDeck

PaperDeck is the literature discovery and card-drawing application behind `https://paperdeck.scansci.com/`.

This repository is the application itself:

- Frontend: React + Vite
- Backend: FastAPI
- Production host: Hugging Face Space
- Custom domain: `paperdeck.scansci.com` via Cloudflare Worker reverse proxy

## Repository Roles

- `D:\VSP\paper-deck`
  - The PaperDeck application source code
  - Builds the frontend and backend into one Docker image for Hugging Face Spaces
- `D:\VSP\scansci-portal-repo`
  - The `www.scansci.com` portal
  - Owns the Cloudflare Worker proxy config for `paperdeck.scansci.com`

If PaperDeck UI or API changes, this repository is the source of truth.
If custom domain routing changes, check `D:\VSP\scansci-portal-repo`.

## Runtime Architecture

Production request flow:

1. User opens `https://paperdeck.scansci.com`
2. Cloudflare Worker proxies traffic to the Hugging Face Space
3. Hugging Face builds the Docker image from this repository
4. FastAPI serves `/api/*`, `/health`, and the checked-in frontend bundle on port `7860`

Relevant files:

- `D:\VSP\paper-deck\Dockerfile`
- `D:\VSP\paper-deck\backend\main.py`
- `D:\VSP\paper-deck\.github\workflows\deploy-huggingface.yml`
- `D:\VSP\scansci-portal-repo\worker\paper-deck-proxy.js`
- `D:\VSP\scansci-portal-repo\worker\wrangler.paper-deck.toml`

## Local Development

### Backend

```powershell
cd D:\VSP\paper-deck
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt
uvicorn backend.main:app --host 127.0.0.1 --port 8004 --reload
```

Backend health:

```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8004/health
```

### Frontend

```powershell
cd D:\VSP\paper-deck\frontend
npm install
npm run dev -- --host 127.0.0.1 --port 5173
```

Frontend dev URL:

```text
http://localhost:5173
```

In development, the frontend targets `http://localhost:8004/api` by default.
In production, the frontend targets `/api`.

## Production Deployment

### Canonical path

Use one source of truth:

1. Push application changes to GitHub
2. Mirror the deploy branch to Hugging Face `main`
3. Let Hugging Face rebuild the Docker app from source
4. Keep Cloudflare proxy config in `scansci-portal-repo`

### Hugging Face

The Hugging Face Space is configured as a Docker Space using this repository layout.
The Docker image serves the checked-in `frontend/dist/` bundle to keep Hugging Face builds fast and predictable.

Recommended runtime env vars:

- `SEMANTIC_SCHOLAR_API_KEY` (optional)
- `REDIS_URL` (optional; app falls back to in-memory cache)
- `CORS_ORIGINS` with `https://paperdeck.scansci.com` included when needed

### Cloudflare

`paperdeck.scansci.com` should be routed by the Worker defined in:

- `D:\VSP\scansci-portal-repo\worker\paper-deck-proxy.js`

## Deployment Policy

PaperDeck follows the same production topology as Paper Atlas.
It is not a Cloudflare Pages app. It is a Hugging Face Space behind a Cloudflare Worker.

The GitHub Actions workflow in this repository mirrors GitHub to Hugging Face, runs frontend/backend smoke tests, and fails if the checked-in `frontend/dist/` bundle is stale.

Required GitHub Actions secret:

- `HF_SPACE_TOKEN`

Operational notes:

- `frontend/dist/` is part of the deployment artifact set and must stay in sync with `frontend/src/`.
- If Hugging Face gets stuck after repeated failed boots, use a normal restart first and a factory reboot only as break-glass recovery.
- Keep the Hugging Face token in secrets or credentials only; do not store it in local git remotes or paste it into logs.

## Validation Checklist

Before pushing:

- Frontend loads in Chinese and English
- `/health` returns `{"status":"ok"}`
- `/api/seeds/search`, `/api/profile/generate`, `/api/recommend`, `/api/cards/generate` respond correctly
- Discovery, Draw, Subscriptions, and Library views render correctly in light and dark themes
- The header shows the AI settings gear in Chinese and English, and the modal opens correctly
- An active custom provider writes `paper-deck-ai-providers` / `paper-deck-ai-active` into browser `localStorage`
- Card detail shows a stable identifier line with DOI or fallback ID
