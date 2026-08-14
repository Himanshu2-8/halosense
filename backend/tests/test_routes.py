"""Focused API regression tests for the connected demo path."""

import sys
from pathlib import Path

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.main import app

client = TestClient(app)


def test_health_reports_available_clips_and_mock_state():
    clips = client.get("/api/clips").json()
    health = client.get("/api/health")

    assert health.status_code == 200
    payload = health.json()
    assert payload["clip_count"] == len(clips)
    if payload["mock_ml"]:
        assert payload["models_loaded"] is False
    else:
        assert isinstance(payload["models_loaded"], bool)


def test_every_listed_clip_has_detail_and_audio():
    response = client.get("/api/clips")
    assert response.status_code == 200
    clips = response.json()
    assert clips

    for clip in clips:
        clip_id = clip["clip_id"]
        assert client.get(f"/api/clips/{clip_id}").status_code == 200
        audio = client.get(f"/api/audio/{clip_id}")
        assert audio.status_code == 200
        assert audio.headers["content-type"].startswith("audio/")
        assert len(audio.content) > 44


def test_correlation_headline_does_not_overclaim_insignificant_data():
    response = client.get("/api/correlation")
    assert response.status_code == 200
    payload = response.json()
    if payload["p_value"] is not None and payload["p_value"] >= 0.05:
        assert "not statistically significant" in payload["headline"]
        assert "predicts" not in payload["headline"].lower()


def test_upload_is_cached_with_retrievable_audio(tmp_path, monkeypatch):
    from app.config import settings
    from app.services import cache_service

    cache_file = tmp_path / "analyses.json"
    uploads_dir = tmp_path / "uploads"
    monkeypatch.setattr(settings, "CACHE_FILE", str(cache_file))
    monkeypatch.setattr(settings, "UPLOADS_DIR", str(uploads_dir))
    monkeypatch.setattr(cache_service, "_cache", {})

    source_audio = Path(__file__).resolve().parents[2] / "data" / "clips" / "ham_silverstone_2021_l52.wav"
    with source_audio.open("rb") as handle:
        response = client.post("/api/analyze", files={"file": ("sample.wav", handle, "audio/wav")})

    assert response.status_code == 200
    payload = response.json()
    assert payload["mocked"] is True
    assert payload["prosody"]["duration_s"] > 2
    assert client.get(payload["audio_url"]).status_code == 200
    assert client.get(f"/api/clips/{payload['clip_id']}").status_code == 200


def test_empty_upload_is_rejected_without_persistence(tmp_path, monkeypatch):
    from app.config import settings

    uploads_dir = tmp_path / "uploads"
    monkeypatch.setattr(settings, "UPLOADS_DIR", str(uploads_dir))

    response = client.post(
        "/api/analyze",
        files={"file": ("empty.mp3", b"", "audio/mpeg")},
    )

    assert response.status_code == 400
    assert response.json()["detail"]["error"] == "EMPTY_FILE"
    assert not uploads_dir.exists()


def test_invalid_audio_is_rejected_and_deleted(tmp_path, monkeypatch):
    from app.config import settings

    uploads_dir = tmp_path / "uploads"
    monkeypatch.setattr(settings, "UPLOADS_DIR", str(uploads_dir))

    response = client.post(
        "/api/analyze",
        files={"file": ("fake.mp3", b"not audio", "audio/mpeg")},
    )

    assert response.status_code == 400
    assert response.json()["detail"]["error"] == "INVALID_AUDIO"
    assert list(uploads_dir.iterdir()) == []


def test_audio_over_duration_limit_is_rejected_and_deleted(tmp_path, monkeypatch):
    from app.config import settings
    from app.routes import analyze

    uploads_dir = tmp_path / "uploads"
    monkeypatch.setattr(settings, "UPLOADS_DIR", str(uploads_dir))
    monkeypatch.setattr(settings, "MAX_AUDIO_SECONDS", 60)
    monkeypatch.setattr(analyze, "_probe_audio", lambda _path: 60.1)

    response = client.post(
        "/api/analyze",
        files={"file": ("long.wav", b"RIFF placeholder", "audio/wav")},
    )

    assert response.status_code == 400
    assert response.json()["detail"]["error"] == "AUDIO_TOO_LONG"
    assert list(uploads_dir.iterdir()) == []


def test_audio_route_rejects_unsafe_clip_ids():
    response = client.get("/api/audio/..%5Coutside")

    assert response.status_code == 400
    assert response.json()["detail"]["error"] == "INVALID_CLIP_ID"
