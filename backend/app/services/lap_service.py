"""
Lap Service — Read precomputed FastF1 lap data and build LapSeries / LapContext objects.

Data source: data/laps/{driver_lower}_{race_slug}.json
These JSON files are produced by scripts/fetch_laps.py (run once, committed).
NEVER call FastF1 at runtime.

Lane: B
"""

import json
import logging
from pathlib import Path
from typing import Optional

from app.config import settings

logger = logging.getLogger(__name__)


def _make_filename(driver: str, race: str) -> str:
    """Convert 'HAM', 'Silverstone 2021' → 'ham_silverstone_2021.json'"""
    slug = race.lower().replace(" ", "_")
    return f"{driver.lower()}_{slug}.json"


def _load_laps_file(driver: str, race: str) -> Optional[dict]:
    """Load a single lap JSON file from data/laps/."""
    filename = _make_filename(driver, race)
    path = settings.resolve_path(settings.LAPS_DIR) / filename
    if not path.exists():
        logger.warning(f"Lap file not found: {path}")
        return None
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _mark_radio_laps(laps: list, driver: str, race: str) -> list:
    """Set is_radio_lap=True for laps that have a radio clip in our dataset."""
    from app.services.cache_service import get_cache
    cache = get_cache()
    radio_laps = set()
    for clip_id, analysis in cache.items():
        if analysis.get("driver") == driver and analysis.get("race") == race:
            if analysis.get("lap") is not None:
                radio_laps.add(analysis["lap"])

    for lap in laps:
        lap["is_radio_lap"] = lap["lap_number"] in radio_laps
    return laps


def get_lap_series(driver: str, race: str) -> Optional[dict]:
    """Build a full LapSeries for the given driver+race. Returns None if no data."""
    data = _load_laps_file(driver, race)
    if data is None:
        return None

    laps = data.get("laps", [])
    laps = _mark_radio_laps(laps, driver, race)

    return {
        "driver": driver,
        "race": race,
        "baseline_s": data.get("baseline_s"),
        "total_laps": len(laps),
        "laps": laps,
    }


def get_lap_context(driver: str, race: str, lap: int) -> Optional[dict]:
    """Build LapContext for a specific lap (used by POST /api/analyze)."""
    series = get_lap_series(driver, race)
    if series is None:
        return None

    laps = series["laps"]
    baseline_s = series.get("baseline_s")

    # Find the target lap
    target = None
    target_idx = None
    for i, lp in enumerate(laps):
        if lp["lap_number"] == lap:
            target = lp
            target_idx = i
            break

    if target is None:
        return None

    # Compute deltas
    lap_time_s = target.get("lap_time_s")
    delta_s = (lap_time_s - baseline_s) if (lap_time_s and baseline_s) else None

    prev_delta = None
    next_delta = None
    if target_idx is not None and target_idx > 0:
        prev_time = laps[target_idx - 1].get("lap_time_s")
        prev_delta = (prev_time - baseline_s) if (prev_time and baseline_s) else None
    if target_idx is not None and target_idx < len(laps) - 1:
        next_time = laps[target_idx + 1].get("lap_time_s")
        next_delta = (next_time - baseline_s) if (next_time and baseline_s) else None

    # Determine trend
    if delta_s is not None and next_delta is not None:
        if next_delta > delta_s + 0.3:
            trend = "DEGRADING"
        elif next_delta < delta_s - 0.3:
            trend = "IMPROVING"
        else:
            trend = "STABLE"
    else:
        trend = "STABLE"

    # Build ±5 lap window
    if target_idx is not None:
        start = max(0, target_idx - 5)
        end = min(len(laps), target_idx + 6)
        window = laps[start:end]
    else:
        window = []

    return {
        "lap_number": lap,
        "lap_time_s": lap_time_s,
        "baseline_s": baseline_s,
        "delta_s": round(delta_s, 3) if delta_s is not None else None,
        "next_lap_delta_s": round(next_delta, 3) if next_delta is not None else None,
        "prev_lap_delta_s": round(prev_delta, 3) if prev_delta is not None else None,
        "compound": target.get("compound"),
        "trend": trend,
        "window": window,
    }
