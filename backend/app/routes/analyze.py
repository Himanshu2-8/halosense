"""
Analyze route — POST /api/analyze

Live analysis of an uploaded audio file.
When MOCK_ML=1, returns mock data.
When MOCK_ML=0, calls Lane A's analyze_audio() pipeline.

CRITICAL: Never import fusion_service at module level — would trigger torch import even when MOCK_ML=1.

Lane: B
"""

import json
import logging
import shutil
import subprocess
import time
import uuid
from datetime import UTC, datetime
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from app.config import settings
from app.schemas import ClipAnalysis

logger = logging.getLogger(__name__)
router = APIRouter()

ALLOWED_EXTENSIONS = {".wav", ".mp3", ".m4a", ".ogg", ".flac"}


def _probe_audio(path: Path) -> float:
    """Validate an upload with ffprobe and return its duration in seconds."""
    ffprobe = shutil.which("ffprobe")
    if not ffprobe:
        raise HTTPException(
            503,
            detail={
                "error": "AUDIO_PROBE_UNAVAILABLE",
                "detail": "The server cannot validate audio because ffprobe is unavailable.",
                "hint": "Install FFmpeg and ensure ffprobe is on PATH.",
            },
        )

    try:
        completed = subprocess.run(
            [
                ffprobe,
                "-v",
                "error",
                "-select_streams",
                "a:0",
                "-show_entries",
                "stream=duration:format=duration",
                "-of",
                "json",
                str(path),
            ],
            check=True,
            capture_output=True,
            text=True,
            timeout=15,
        )
        payload = json.loads(completed.stdout)
        streams = payload.get("streams", [])
        if not streams:
            raise ValueError("No audio stream found")
        raw_duration = streams[0].get("duration") or payload.get("format", {}).get("duration")
        duration = float(raw_duration)
        if duration <= 0:
            raise ValueError("Audio duration is zero")
        return duration
    except (subprocess.SubprocessError, json.JSONDecodeError, TypeError, ValueError) as exc:
        logger.info("Rejected invalid audio upload %s: %s", path.name, exc)
        raise HTTPException(
            400,
            detail={
                "error": "INVALID_AUDIO",
                "detail": "The uploaded file does not contain readable audio.",
                "hint": "Upload a valid WAV, MP3, M4A, OGG, or FLAC audio file.",
            },
        ) from exc


@router.post("/analyze", response_model=ClipAnalysis)
async def analyze_audio(
    file: UploadFile = File(...),
    driver: str | None = Form(None),
    race: str | None = Form(None),
    lap: int | None = Form(None),
):
    """
    Analyze an uploaded audio file and return a ClipAnalysis.
    Supports multipart/form-data with optional driver/race/lap metadata.
    """
    # 1. Validate file presence
    if not file.filename:
        raise HTTPException(
            400,
            detail={
                "error": "NO_FILE",
                "detail": "No file was uploaded.",
                "hint": "Attach an audio file in the 'file' field.",
            },
        )

    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            400,
            detail={
                "error": "UNSUPPORTED_FORMAT",
                "detail": f"Format '{ext}' is not supported.",
                "hint": f"Use one of: {', '.join(sorted(ALLOWED_EXTENSIONS))}",
            },
        )

    # 2. Read file and check size
    contents = await file.read()
    max_bytes = settings.MAX_UPLOAD_MB * 1024 * 1024
    if not contents:
        raise HTTPException(
            400,
            detail={
                "error": "EMPTY_FILE",
                "detail": "The uploaded audio file is empty.",
                "hint": "Choose a non-empty audio file and try again.",
            },
        )
    if len(contents) > max_bytes:
        raise HTTPException(
            413,
            detail={
                "error": "FILE_TOO_LARGE",
                "detail": f"File is {len(contents) / 1024 / 1024:.1f} MB; max is {settings.MAX_UPLOAD_MB} MB.",
                "hint": f"Keep the file under {settings.MAX_UPLOAD_MB} MB.",
            },
        )

    # 3. Save to uploads directory
    clip_id = f"upload_{uuid.uuid4().hex[:8]}"
    upload_dir = settings.resolve_path(settings.UPLOADS_DIR)
    upload_dir.mkdir(parents=True, exist_ok=True)
    wav_path = upload_dir / f"{clip_id}{ext}"
    wav_path.write_bytes(contents)

    try:
        duration_s = _probe_audio(wav_path)
        if duration_s > settings.MAX_AUDIO_SECONDS:
            raise HTTPException(
                400,
                detail={
                    "error": "AUDIO_TOO_LONG",
                    "detail": f"Audio is {duration_s:.1f}s; max is {settings.MAX_AUDIO_SECONDS}s.",
                    "hint": f"Trim the clip to {settings.MAX_AUDIO_SECONDS} seconds or less.",
                },
            )
    except HTTPException:
        wav_path.unlink(missing_ok=True)
        raise

    # 4. Run analysis
    start_ms = time.time()

    if settings.MOCK_ML:
        # Return mock data — no torch needed
        from app.services.cache_service import get_mock_analysis
        result = get_mock_analysis(clip_id)
    else:
        # Call Lane A's pipeline (conditional import to avoid torch at module level)
        try:
            from app.services.fusion_service import analyze_audio as run_pipeline  # type: ignore
            result = run_pipeline(str(wav_path), device=settings.DEVICE)
        except ImportError as exc:
            raise HTTPException(
                500,
                detail={
                    "error": "MODEL_LOAD_FAILED",
                    "detail": "ML pipeline not available (fusion_service missing). Set MOCK_ML=1 for mock mode.",
                    "hint": "Run with MOCK_ML=1 or install torch + transformers.",
                },
            ) from exc
        except Exception as e:
            logger.exception("Inference failed")
            raise HTTPException(
                500,
                detail={
                    "error": "INFERENCE_FAILED",
                    "detail": f"Model inference failed: {str(e)[:200]}",
                    "hint": "Check server logs for details.",
                },
            ) from e

    # Use the media container duration for playback even when inference is mocked.
    result["prosody"]["duration_s"] = round(duration_s, 3)

    processing_ms = int((time.time() - start_ms) * 1000)

    # 5. Enrich with metadata
    now_iso = datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
    result.update({
        "clip_id": clip_id,
        "source": "UPLOAD",
        "driver": driver,
        "race": race,
        "lap": lap,
        "session_type": None,
        "audio_url": f"/api/audio/{clip_id}",
        "processed_at": now_iso,
        "processing_ms": processing_ms,
    })

    # 6. Add lap context if all three metadata fields provided
    if driver and race and lap:
        try:
            from app.services.lap_service import get_lap_context
            result["lap_context"] = get_lap_context(driver, race, lap)
        except Exception as e:
            logger.warning(f"Could not compute lap context: {e}")
            result["lap_context"] = None
    else:
        result["lap_context"] = None

    # 7. Cache the result so it appears in /api/clips
    from app.services.cache_service import add_to_cache
    add_to_cache(clip_id, result)

    return result
