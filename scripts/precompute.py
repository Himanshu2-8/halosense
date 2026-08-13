"""
Precompute all clips through the ML pipeline and update data/cache/analyses.json.

Run from project root with MOCK_ML=0 and a GPU available (Lane A's machine).

Usage:
    cd backend && python ../scripts/precompute.py

Or from project root:
    MOCK_ML=0 python scripts/precompute.py

Requirements:
- Lane A's ML services must be available (fusion_service.py, etc.)
- data/clips/ must contain the WAV files
- data/metadata.csv must map clip_ids to driver/race/lap

Output:
- Updates data/cache/analyses.json with real model output
- Prints per-clip timing stats

After running:
    pytest backend/tests/test_contract.py
to verify the output matches the schema.
"""

import csv
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

# ── Configuration ─────────────────────────────────────────────────

PROJECT_ROOT = Path(__file__).resolve().parent.parent
CLIPS_DIR = PROJECT_ROOT / "data" / "clips"
CACHE_FILE = PROJECT_ROOT / "data" / "cache" / "analyses.json"
METADATA_CSV = PROJECT_ROOT / "data" / "metadata.csv"
LAPS_DIR = PROJECT_ROOT / "data" / "laps"

# Add backend to path so we can import app modules
sys.path.insert(0, str(PROJECT_ROOT / "backend"))


def load_metadata() -> dict:
    """Load data/metadata.csv into a dict keyed by clip_id."""
    if not METADATA_CSV.exists():
        print(f"Warning: {METADATA_CSV} not found. No metadata will be attached.")
        return {}
    meta = {}
    with open(METADATA_CSV, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            clip_id = row.get("clip_id", "").strip()
            if clip_id:
                meta[clip_id] = {
                    "driver": row.get("driver", "").strip() or None,
                    "race": row.get("race", "").strip() or None,
                    "lap": int(row["lap"]) if row.get("lap", "").strip() else None,
                    "session_type": row.get("session_type", "").strip() or None,
                }
    return meta


def main():
    print("Silent Co-Driver — Precompute Pipeline")
    print("=" * 50)

    # Verify ML services are importable
    try:
        from app.services.fusion_service import analyze_audio  # type: ignore
    except ImportError as e:
        print(f"Error: Cannot import fusion_service: {e}")
        print("Make sure torch, transformers, soundfile are installed.")
        print("Or run with MOCK_ML=1 for mock mode (not useful for precompute).")
        sys.exit(1)

    # Load lap service for context enrichment
    try:
        from app.services.lap_service import get_lap_context  # type: ignore
    except ImportError:
        get_lap_context = None
        print("Warning: lap_service not available. Lap context will be skipped.")

    # Find all WAV clips
    clips = sorted(CLIPS_DIR.glob("*.wav"))
    if not clips:
        print(f"No WAV files found in {CLIPS_DIR}")
        print("Add audio files to data/clips/ first.")
        sys.exit(1)

    print(f"Found {len(clips)} clips in {CLIPS_DIR.relative_to(PROJECT_ROOT)}")
    print()

    metadata = load_metadata()

    # Load existing cache (to preserve any uploaded clips)
    existing_cache = {}
    if CACHE_FILE.exists():
        with open(CACHE_FILE, "r", encoding="utf-8") as f:
            for item in json.load(f):
                existing_cache[item["clip_id"]] = item
        print(f"Loaded {len(existing_cache)} existing cached clips.")
    print()

    results = {}
    # Preserve any non-dataset clips (uploads) from existing cache
    for clip_id, analysis in existing_cache.items():
        if analysis.get("source") == "UPLOAD":
            results[clip_id] = analysis

    # Process each WAV clip
    for wav_path in clips:
        clip_id = wav_path.stem
        print(f"Processing: {clip_id}")
        t0 = time.time()

        try:
            result = analyze_audio(str(wav_path), device="auto")
        except Exception as e:
            print(f"  ❌ Failed: {e}")
            continue

        elapsed = time.time() - t0

        # Enrich with metadata
        meta = metadata.get(clip_id, {})
        driver = meta.get("driver")
        race = meta.get("race")
        lap = meta.get("lap")

        # Add lap context if available
        lap_context = None
        if get_lap_context and driver and race and lap:
            try:
                lap_context = get_lap_context(driver, race, lap)
            except Exception as e:
                print(f"  Warning: lap context failed: {e}")

        now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        result.update({
            "clip_id": clip_id,
            "source": "DATASET",
            "driver": driver,
            "race": race,
            "lap": lap,
            "session_type": meta.get("session_type"),
            "audio_url": f"/api/audio/{clip_id}",
            "processed_at": now_iso,
            "processing_ms": int(elapsed * 1000),
            "lap_context": lap_context,
            "mocked": False,
        })

        results[clip_id] = result
        mood = result["mood"]["label"]
        stress = result["mood"]["stress_index"]
        print(f"  ✅ {mood} (stress={stress:.2f}, {elapsed:.1f}s)")

    # Save updated cache
    CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
    data = list(results.values())
    with open(CACHE_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    print()
    print(f"Saved {len(data)} clips to {CACHE_FILE.relative_to(PROJECT_ROOT)}")
    print()
    print("Next steps:")
    print("  1. Run: pytest backend/tests/test_contract.py")
    print("  2. Commit: git add data/cache/analyses.json data/laps/")
    print("  3. Push to lane-b/backend-data branch")


if __name__ == "__main__":
    main()
