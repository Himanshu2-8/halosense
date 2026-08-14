"""
FastAPI application entry point.

Run with:
    cd backend && uvicorn app.main:app --reload --port 8000

Or from project root:
    uvicorn backend.app.main:app --reload --port 8000
"""

import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings


logging.basicConfig(
    level=settings.LOG_LEVEL.upper(),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown lifecycle."""
    logger.info(f"Starting Silent Co-Driver API (MOCK_ML={settings.MOCK_ML})")
    # Pre-load the cache on startup so first request is fast
    from app.services.cache_service import get_cache
    cache = get_cache()
    logger.info(f"Loaded {len(cache)} clips from cache.")

    # --- Cleanup custom uploads on startup ---
    uploads_dir = settings.resolve_path(settings.UPLOADS_DIR)
    if uploads_dir.exists():
        for file in uploads_dir.iterdir():
            if file.is_file() and file.name != ".gitkeep":
                try:
                    file.unlink()
                except Exception as e:
                    logger.error(f"Failed to delete {file.name}: {e}")
    
    # Remove custom uploads from cache
    to_delete = [c_id for c_id, analysis in cache.items() if analysis.get("source") == "UPLOAD" or c_id.startswith("upload_")]
    if to_delete:
        from app.services.cache_service import _save_cache
        for c_id in to_delete:
            del cache[c_id]
        _save_cache(cache)
        logger.info(f"Cleared {len(to_delete)} custom uploaded clips on startup.")
    # ----------------------------------------

    yield
    logger.info("Shutting down.")


app = FastAPI(
    title="Silent Co-Driver API",
    description="F1 driver stress detection from team radio audio",
    version="1.0.0",
    lifespan=lifespan,
)

# ── CORS ─────────────────────────────────────────────────────────
origins = [o.strip() for o in settings.CORS_ORIGINS.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routes ───────────────────────────────────────────────────────
from app.routes.health import router as health_router
from app.routes.clips import router as clips_router
from app.routes.analyze import router as analyze_router
from app.routes.laps import router as laps_router
from app.routes.correlation import router as correlation_router
from app.routes.audio import router as audio_router
from app.routes.eval_route import router as eval_router

app.include_router(health_router, prefix="/api")
app.include_router(clips_router, prefix="/api")
app.include_router(analyze_router, prefix="/api")
app.include_router(laps_router, prefix="/api")
app.include_router(correlation_router, prefix="/api")
app.include_router(audio_router, prefix="/api")
app.include_router(eval_router, prefix="/api")
