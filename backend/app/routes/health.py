"""
Health route — GET /api/health

Returns backend status: mock mode, models loaded, clip count.
Frontend calls this on load to verify connectivity.

Lane: B
"""

from fastapi import APIRouter
from app.config import settings
from app.services.cache_service import get_cache

router = APIRouter()


@router.get("/health")
async def health():
    """Health check endpoint."""
    cache = get_cache()
    return {
        "status": "ok",
        "mock_ml": settings.MOCK_ML,
        "models_loaded": not settings.MOCK_ML,  # Simplified; real check would query services
        "clip_count": len(cache),
        "version": "1.0.0",
    }
