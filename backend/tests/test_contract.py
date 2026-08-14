"""
Contract tests — validate that mock data matches schemas.

Run with:
    cd backend && pytest tests/test_contract.py -v

Or from project root:
    pytest backend/tests/test_contract.py -v

These tests run in <1s, require no models, and are our safety net before every push.
See CONTRACT.md §8 for what is tested.
"""

import json
import sys
from pathlib import Path

import pytest

# Add backend to sys.path so we can import app.schemas
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.schemas import (
    ClipAnalysis,
    MoodLabel,
    Quadrant,
    TrendDirection,
)


PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
CACHE_FILE = PROJECT_ROOT / "data" / "cache" / "analyses.json"


def load_cache() -> list:
    """Load and return the analyses.json as a list."""
    if not CACHE_FILE.exists():
        pytest.skip(f"Cache file not found: {CACHE_FILE}")
    with open(CACHE_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


class TestContract:
    """Validate that all cached data obeys the CONTRACT.md spec."""

    def test_cache_is_valid_json(self):
        """analyses.json must be a non-empty JSON array."""
        data = load_cache()
        assert isinstance(data, list), "analyses.json must be a JSON array, not an object."
        assert len(data) >= 1, "analyses.json must have at least 1 clip."

    def test_every_clip_validates(self):
        """Every item must pass Pydantic ClipAnalysis validation."""
        data = load_cache()
        for item in data:
            clip = ClipAnalysis(**item)
            assert clip.clip_id, f"clip_id must not be empty: {item}"
            assert clip.transcript is not None, f"transcript must not be None: {clip.clip_id}"
            assert clip.asr_model, f"asr_model must not be empty: {clip.clip_id}"

    def test_no_nan_in_json(self):
        """NaN and Infinity are banned — they are not valid JSON."""
        raw = CACHE_FILE.read_text(encoding="utf-8")
        assert "NaN" not in raw, "NaN found in analyses.json — see CONTRACT.md §9."
        assert "Infinity" not in raw, "Infinity found in analyses.json."
        assert "-Infinity" not in raw, "-Infinity found in analyses.json."

    def test_scores_in_range(self):
        """All 0–1 scores must be within [0, 1]."""
        data = load_cache()
        for item in data:
            cid = item.get("clip_id", "?")
            prosody = item["prosody"]
            assert 0 <= prosody["arousal"] <= 1, f"{cid}: arousal out of range: {prosody['arousal']}"
            assert 0 <= prosody["dominance"] <= 1, f"{cid}: dominance out of range"
            assert 0 <= prosody["valence"] <= 1, f"{cid}: valence out of range"

            mood = item["mood"]
            assert 0 <= mood["stress_index"] <= 1, f"{cid}: stress_index out of range: {mood['stress_index']}"
            assert 0 <= mood["fatigue_index"] <= 1, f"{cid}: fatigue_index out of range"
            assert 0 <= mood["confidence"] <= 1, f"{cid}: confidence out of range"

            if prosody.get("pause_ratio") is not None:
                assert 0 <= prosody["pause_ratio"] <= 1, f"{cid}: pause_ratio out of range"
            if prosody.get("rms_energy") is not None:
                assert 0 <= prosody["rms_energy"] <= 1, f"{cid}: rms_energy out of range"

    def test_valid_enum_values(self):
        """Enum fields must contain only valid values."""
        data = load_cache()
        for item in data:
            cid = item.get("clip_id", "?")
            MoodLabel(item["mood"]["label"])  # raises ValueError if invalid
            Quadrant(item["mood"]["quadrant"])  # raises ValueError if invalid
            if item.get("lap_context"):
                TrendDirection(item["lap_context"]["trend"])

    def test_audio_urls_are_valid(self):
        """audio_url must follow the /api/audio/{clip_id} format."""
        data = load_cache()
        for item in data:
            url = item.get("audio_url", "")
            cid = item.get("clip_id", "?")
            assert url.startswith("/api/audio/"), f"{cid}: Bad audio_url format: {url}"
            url_clip_id = url.split("/")[-1]
            assert url_clip_id == cid, f"{cid}: audio_url clip_id mismatch: {url_clip_id}"

    def test_dataset_clips_have_matching_audio(self):
        """Every committed dataset analysis must have audio for a fresh-clone demo."""
        data = load_cache()
        clips_dir = PROJECT_ROOT / "data" / "clips"
        for item in data:
            if item.get("source") != "DATASET":
                continue
            audio_path = clips_dir / f"{item['clip_id']}.wav"
            assert audio_path.is_file(), f"{item['clip_id']}: missing dataset audio: {audio_path}"
            assert audio_path.stat().st_size > 44, f"{item['clip_id']}: WAV contains no audio frames"

    def test_words_are_valid(self):
        """Word timings must have valid start/end values."""
        data = load_cache()
        for item in data:
            cid = item.get("clip_id", "?")
            words = item.get("words", [])
            for w in words:
                assert isinstance(w["word"], str), f"{cid}: word.word must be str"
                assert isinstance(w["start"], (int, float)), f"{cid}: word.start must be numeric"
                assert isinstance(w["end"], (int, float)), f"{cid}: word.end must be numeric"
                assert w["start"] >= 0, f"{cid}: word.start must be >= 0"
                assert w["end"] >= w["start"], f"{cid}: word.end must be >= word.start"

    def test_clip_count(self):
        """Must have at least 5 mock clips as required by CONTRACT.md §6."""
        data = load_cache()
        assert len(data) >= 5, f"Need at least 5 mock clips, got {len(data)}."

    def test_required_mood_labels_present(self):
        """Mock fixture must cover STRESSED, CALM, TIRED, UNKNOWN (CONTRACT.md §6)."""
        data = load_cache()
        labels_present = {item["mood"]["label"] for item in data}
        required = {"STRESSED", "CALM", "TIRED", "UNKNOWN"}
        missing = required - labels_present
        assert not missing, f"Missing mood labels in mock fixture: {missing}"

    def test_null_lap_context_clip_present(self):
        """Must have at least one clip with lap_context=null (upload case)."""
        data = load_cache()
        has_null_ctx = any(item.get("lap_context") is None for item in data)
        assert has_null_ctx, "No clip with lap_context=null found. Add an upload-mock clip."
