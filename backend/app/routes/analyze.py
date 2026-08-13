"""
Analyze route — POST /api/analyze

Live analysis of an uploaded audio file.
When MOCK_ML=1, returns mock data.
When MOCK_ML=0, calls Lane A's analyze_audio() pipeline.

CRITICAL: Never import fusion_service at module level — would trigger torch import even when MOCK_ML=1.

Lane: B
"""

import uuid
import time
import logging
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from app.config import settings
from app.schemas import ClipAnalysis

logger = logging.getLogger(__name__)
router = APIRouter()

ALLOWED_EXTENSIONS = {".wav", ".mp3", ".m4a", ".ogg", ".flac"}


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
        except ImportError:
            raise HTTPException(
                500,
                detail={
                    "error": "MODEL_LOAD_FAILED",
                    "detail": "ML pipeline not available (fusion_service missing). Set MOCK_ML=1 for mock mode.",
                    "hint": "Run with MOCK_ML=1 or install torch + transformers.",
                },
            )
        except Exception as e:
            logger.exception("Inference failed")
            raise HTTPException(
                500,
                detail={
                    "error": "INFERENCE_FAILED",
                    "detail": f"Model inference failed: {str(e)[:200]}",
                    "hint": "Check server logs for details.",
                },
            )

    processing_ms = int((time.time() - start_ms) * 1000)

    # 5. Enrich with metadata
    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
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
