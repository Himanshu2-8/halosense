"""
Correlation route — GET /api/correlation

Returns aggregate correlation between stress index and lap-time delta.
This is the "money slide" — our headline finding for the demo and PPT.

Lane: B
"""

from fastapi import APIRouter
from app.schemas import CorrelationSummary
from app.services.correlation_service import compute_correlation

router = APIRouter()


@router.get("/correlation", response_model=CorrelationSummary)
async def correlation():
    """Return Pearson correlation between stress index and lap-time delta across all clips."""
    return compute_correlation()
