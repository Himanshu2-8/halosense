"""
Health route — GET /api/health

Returns backend status: mock mode, models loaded, clip count.
Frontend calls this on load to verify connectivity.

Lane: B
"""

from fastapi import APIRouter
from app.config import settings
from app.services.cache_service import get_available_cache

router = APIRouter()


@router.get("/health")
async def health():
    """Health check endpoint."""
    cache = get_available_cache()
    if settings.MOCK_ML:
        models_loaded = False
    else:
        from app.services.asr_service import models_loaded as asr_loaded
        from app.services.emotion_service import models_loaded as emotion_loaded

        models_loaded = asr_loaded() and emotion_loaded()
    return {
        "status": "ok",
        "mock_ml": settings.MOCK_ML,
        "models_loaded": models_loaded,
        "clip_count": len(cache),
        "version": "1.0.0",
    }
