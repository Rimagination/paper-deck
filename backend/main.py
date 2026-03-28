from __future__ import annotations

import asyncio
import logging
import traceback
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles

from backend.config import Settings, get_settings
from backend.routers.cards import router as cards_router
from backend.routers.profile import router as profile_router
from backend.routers.recommend import router as recommend_router
from backend.routers.seeds import router as seeds_router
from backend.routers.subscriptions import router as subscriptions_router
from backend.services.cache import CacheService
from backend.services.card_generator import CardGenerator
from backend.services.journal_zone import JournalZoneService
from backend.services.openalex import OpenAlexClient
from backend.services.semantic_scholar import SemanticScholarClient

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def _resolve_journal_zone_index_path(settings: Settings) -> Path | None:
    candidates: list[Path] = []
    if settings.journal_zone_index_path:
        candidates.append(Path(settings.journal_zone_index_path).expanduser())

    here = Path(__file__).resolve()
    candidates.extend([
        here.parents[2] / "journal-scout-tmp" / "data" / "search_index.json",
        here.parents[1] / "data" / "search_index.json",
    ])

    for path in candidates:
        if path.exists():
            return path
    return None


def create_app(settings: Settings | None = None) -> FastAPI:
    app_settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        logger.info("Starting up PaperDeck API...")
        try:
            cache_service = CacheService(app_settings.redis_url)
            await cache_service.connect()
            logger.info("Cache connected: %s", cache_service.backend)

            s2_client = SemanticScholarClient(app_settings)
            oa_client = OpenAlexClient(user_agent=app_settings.user_agent)
            card_generator = CardGenerator(app_settings)
            journal_zone = JournalZoneService()
            journal_zone_index = _resolve_journal_zone_index_path(app_settings)
            logger.info("Services initialized")

            app.state.settings = app_settings
            app.state.cache = cache_service
            app.state.s2_client = s2_client
            app.state.oa_client = oa_client
            app.state.card_generator = card_generator
            app.state.journal_zone = journal_zone

            journal_zone_task = None
            if journal_zone_index is not None:
                async def _load_journal_zone() -> None:
                    await asyncio.to_thread(journal_zone.load, journal_zone_index)
                    logger.info("Journal zone index loaded from %s", journal_zone_index)

                journal_zone_task = asyncio.create_task(_load_journal_zone())
            else:
                logger.warning("Journal zone index not found; zone lookup will rely on fallback matching only")

            logger.info("Startup complete!")
            yield

            logger.info("Shutting down...")
            if journal_zone_task is not None and not journal_zone_task.done():
                journal_zone_task.cancel()
            await s2_client.close()
            await oa_client.close()
            await card_generator.close()
            await cache_service.close()
            logger.info("Shutdown complete")
        except Exception as e:
            logger.error("Startup failed: %s", e)
            logger.error(traceback.format_exc())
            raise

    app = FastAPI(
        title="PaperDeck API",
        version="0.1.0",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=app_settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    app.include_router(seeds_router, prefix="/api")
    app.include_router(profile_router, prefix="/api")
    app.include_router(recommend_router, prefix="/api")
    app.include_router(cards_router, prefix="/api")
    app.include_router(subscriptions_router, prefix="/api")

    # --- Serve pre-built frontend (SPA) ---
    # Resolve dist folder: /app/frontend/dist in Docker, or local dev path
    _here = Path(__file__).resolve().parent
    _dist_candidates = [
        Path("/app/frontend/dist"),           # Docker layout
        _here.parent / "frontend" / "dist",   # local dev
    ]
    _dist_dir: Path | None = None
    for _d in _dist_candidates:
        if (_d / "index.html").exists():
            _dist_dir = _d
            break

    if _dist_dir is not None:
        logger.info("Serving frontend from %s", _dist_dir)

        # Serve /assets/* with aggressive cache
        if (_dist_dir / "assets").is_dir():
            app.mount(
                "/assets",
                StaticFiles(directory=str(_dist_dir / "assets")),
                name="frontend-assets",
            )

        # SPA catch-all: any non-API, non-health route -> index.html
        _index_html = _dist_dir / "index.html"

        @app.get("/{full_path:path}")
        async def _spa_catchall(full_path: str) -> HTMLResponse:
            # Serve specific static files (favicon etc.) if they exist
            candidate = _dist_dir / full_path
            if full_path and candidate.exists() and candidate.is_file():
                return FileResponse(str(candidate))
            return HTMLResponse(content=_index_html.read_text(), status_code=200)
    else:
        logger.warning("Frontend dist not found; API-only mode")

    return app


app = create_app()
