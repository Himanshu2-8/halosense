"""
Correlation Service — Compute Pearson correlation between stress index and lap-time delta.

This is our headline finding: stress predicts lap-time loss.
See AGENTS.md §10 for the full explanation.

Lane: B
"""

import logging
from typing import Optional

logger = logging.getLogger(__name__)


def compute_correlation() -> dict:
    """
    Returns a CorrelationSummary dict.
    Collects all clips from cache that have both stress_index and delta_s,
    then computes Pearson r.
    """
    from app.services.cache_service import get_cache

    try:
        import numpy as np
        from scipy.stats import pearsonr
    except ImportError:
        logger.warning("numpy/scipy not available — returning empty correlation.")
        return _empty_correlation()

    cache = get_cache()

    points = []
    for clip_id, analysis in cache.items():
        mood = analysis.get("mood", {})
        stress = mood.get("stress_index")
        lap_ctx = analysis.get("lap_context")
        delta = lap_ctx.get("delta_s") if lap_ctx else None

        if stress is not None and delta is not None:
            points.append({
                "clip_id": clip_id,
                "driver": analysis.get("driver"),
                "stress_index": float(stress),
                "delta_s": float(delta),
                "mood_label": mood.get("label", "UNKNOWN"),
            })

    n = len(points)

    if n < 3:
        return {
            "n": n,
            "pearson_r": None,
            "p_value": None,
            "pearson_r_next_lap": None,
            "mean_delta_by_mood": {},
            "points": points,
            "headline": f"Only {n} clip(s) have both stress and lap data. Need at least 3 for correlation.",
        }

    stresses = np.array([p["stress_index"] for p in points])
    deltas = np.array([p["delta_s"] for p in points])

    r, p = pearsonr(stresses, deltas)
    r = round(float(r), 3)
    p_val = round(float(p), 4)

    # Next-lap correlation
    r_next: Optional[float] = None
    next_points = []
    for clip_id, analysis in cache.items():
        mood = analysis.get("mood", {})
        stress = mood.get("stress_index")
        lap_ctx = analysis.get("lap_context")
        next_delta = lap_ctx.get("next_lap_delta_s") if lap_ctx else None
        if stress is not None and next_delta is not None:
            next_points.append((float(stress), float(next_delta)))

    if len(next_points) >= 3:
        s_arr = np.array([x[0] for x in next_points])
        d_arr = np.array([x[1] for x in next_points])
        r_next_raw, _ = pearsonr(s_arr, d_arr)
        r_next = round(float(r_next_raw), 3)

    # Mean delta by mood
    by_mood: dict = {}
    for p_item in points:
        label = p_item["mood_label"]
        by_mood.setdefault(label, []).append(p_item["delta_s"])
    mean_delta_by_mood = {k: round(float(np.mean(v)), 3) for k, v in by_mood.items()}

    # Headline
    p_str = f"p = {p_val:.4f}" if p_val >= 0.001 else "p < 0.001"
    stressed_delta = mean_delta_by_mood.get("STRESSED", 0)
    sign = "+" if stressed_delta > 0 else ""
    headline = (
        f"Across {n} radio messages, stress index correlates with lap-time loss "
        f"at r = {r:.2f} ({p_str}). "
        f"Messages flagged STRESSED averaged {sign}{stressed_delta:.2f}s "
        f"versus the driver's clean-lap baseline."
    )

    return {
        "n": n,
        "pearson_r": r,
        "p_value": p_val,
        "pearson_r_next_lap": r_next,
        "mean_delta_by_mood": mean_delta_by_mood,
        "points": points,
        "headline": headline,
    }


def _empty_correlation() -> dict:
    """Return an empty correlation summary when there's no data."""
    return {
        "n": 0,
        "pearson_r": None,
        "p_value": None,
        "pearson_r_next_lap": None,
        "mean_delta_by_mood": {},
        "points": [],
        "headline": "No clips with both stress and lap data available.",
    }
