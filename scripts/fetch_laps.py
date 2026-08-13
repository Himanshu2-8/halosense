"""
Fetch lap data from FastF1 and dump to data/laps/ as JSON.

Run ONCE locally, commit the output. NEVER call FastF1 at runtime.
FastF1 downloads ~50-100 MB of data per session — not suitable for API calls.

Usage (from project root):
    python scripts/fetch_laps.py

Dependencies (not in main requirements.txt):
    pip install fastf1 pandas numpy
"""

import json
import math
import sys
from pathlib import Path

try:
    import fastf1
    import pandas as pd
    import numpy as np
except ImportError:
    print("Error: fastf1, pandas, and numpy are required.")
    print("Install with: pip install fastf1 pandas numpy")
    sys.exit(1)

# ── Configuration ─────────────────────────────────────────────────

# Sessions to fetch — add more as you collect audio clips
# Format: (year, GP name or round number, session_type, driver_code)
SESSIONS = [
    (2021, "British Grand Prix", "R", "HAM"),   # Bono, my tyres are gone
    (2018, "Abu Dhabi Grand Prix", "R", "RAI"),  # Leave me alone
    (2018, "German Grand Prix", "R", "VET"),     # Germany crash
    (2021, "Hungarian Grand Prix", "R", "HAM"),  # Strategy call
]

PROJECT_ROOT = Path(__file__).resolve().parent.parent
OUTPUT_DIR = PROJECT_ROOT / "data" / "laps"
CACHE_DIR = PROJECT_ROOT / "backend" / ".fastf1_cache"


# ── Utilities ─────────────────────────────────────────────────────

def clean(value):
    """Convert pandas/numpy missing values to None for JSON safety."""
    if value is None:
        return None
    try:
        if pd.isna(value):
            return None
    except (TypeError, ValueError):
        pass
    if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
        return None
    if hasattr(value, "item"):
        value = value.item()
    if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
        return None
    return value


def td_to_seconds(td) -> float | None:
    """Convert pandas Timedelta to float seconds. NEVER return a Timedelta."""
    if td is None:
        return None
    try:
        if pd.isna(td):
            return None
    except (TypeError, ValueError):
        pass
    try:
        return round(float(pd.Timedelta(td).total_seconds()), 3)
    except Exception:
        return None


# ── Fetch logic ───────────────────────────────────────────────────

def fetch_session(year: int, gp: str, session_type: str, driver: str) -> dict:
    """Fetch and process lap data for one driver in one session."""
    print(f"  Fetching {driver} @ {gp} {year} ({session_type})...")

    fastf1.Cache.enable_cache(str(CACHE_DIR))
    session = fastf1.get_session(year, gp, session_type)
    session.load(telemetry=False, weather=False, messages=False)

    driver_laps = session.laps.pick_drivers(driver)

    if driver_laps.empty:
        raise ValueError(f"No laps found for driver {driver}")

    # Compute baseline = median of accurate, non-pit laps
    clean_mask = (
        (driver_laps["IsAccurate"] == True) &
        (~driver_laps["PitInTime"].notna()) &
        (~driver_laps["PitOutTime"].notna())
    )
    clean_laps = driver_laps[clean_mask]
    clean_times = [td_to_seconds(t) for t in clean_laps["LapTime"] if pd.notna(t)]
    clean_times = [t for t in clean_times if t is not None]
    baseline_s = round(float(np.median(clean_times)), 3) if clean_times else None

    laps = []
    for _, lap in driver_laps.iterrows():
        lap_time_s = td_to_seconds(lap.get("LapTime"))
        delta_s = round(lap_time_s - baseline_s, 3) if (lap_time_s and baseline_s) else None

        pit_in = clean(lap.get("PitInTime"))
        pit_out = clean(lap.get("PitOutTime"))
        is_pit = bool(pit_in is not None or pit_out is not None)

        lap_num_raw = clean(lap.get("LapNumber"))
        lap_num = int(lap_num_raw) if lap_num_raw is not None else 0

        stint_raw = clean(lap.get("Stint"))
        tyre_raw = clean(lap.get("TyreLife"))

        laps.append({
            "lap_number": lap_num,
            "lap_time_s": lap_time_s,
            "delta_s": delta_s,
            "compound": clean(lap.get("Compound")),
            "stint": int(stint_raw) if stint_raw is not None else None,
            "tyre_life": int(tyre_raw) if tyre_raw is not None else None,
            "is_pit_lap": is_pit,
            "is_accurate": bool(clean(lap.get("IsAccurate")) or False),
            "track_status": clean(lap.get("TrackStatus")),
            "is_radio_lap": False,  # Set at runtime by lap_service
        })

    # Build race name (simplified format matching CONTRACT.md)
    event_name = session.event.get("EventName", gp)
    race_name = f"{event_name} {year}"

    return {
        "driver": driver,
        "race": race_name,
        "session_key": f"{year}_{session.event.get('RoundNumber', '?')}_{session_type}",
        "baseline_s": baseline_s,
        "laps": laps,
    }


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    CACHE_DIR.mkdir(parents=True, exist_ok=True)

    print(f"Output directory: {OUTPUT_DIR}")
    print(f"FastF1 cache: {CACHE_DIR}")
    print()

    for year, gp, stype, driver in SESSIONS:
        try:
            data = fetch_session(year, gp, stype, driver)
            # Filename matches _make_filename() in lap_service.py
            race_slug = data["race"].lower().replace(" ", "_")
            filename = f"{driver.lower()}_{race_slug}.json"
            out_path = OUTPUT_DIR / filename
            with open(out_path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            print(f"  ✅ Saved → {out_path.relative_to(PROJECT_ROOT)}")
            print(f"     {len(data['laps'])} laps, baseline={data['baseline_s']}s")
        except Exception as e:
            print(f"  ❌ Failed: {e}")

    print("\nDone. Commit data/laps/*.json to git.")


if __name__ == "__main__":
    main()
