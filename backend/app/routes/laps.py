"""
Laps route — GET /api/laps?driver=HAM&race=Silverstone+2021

Returns full lap-time series for a driver+race combination.
Powers the detailed lap chart.

Lane: B
"""

from fastapi import APIRouter, Query, HTTPException
from app.schemas import LapSeries
from app.services.lap_service import get_lap_series

router = APIRouter()


@router.get("/laps", response_model=LapSeries)
async def laps(
    driver: str = Query(..., description="3-letter driver code, e.g. HAM"),
    race: str = Query(..., description="Race name, e.g. 'Silverstone 2021'"),
):
    """Return the full lap series for a given driver+race."""
    series = get_lap_series(driver, race)
    if series is None:
        raise HTTPException(
            status_code=404,
            detail={
                "error": "LAPS_NOT_FOUND",
                "detail": f"No lap data for {driver} at {race}.",
                "hint": "Check that data/laps/ contains a JSON for this driver+race combination.",
            },
        )
    return series
