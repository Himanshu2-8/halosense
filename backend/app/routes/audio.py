"""
Audio route — GET /api/audio/{clip_id}

Serves raw WAV audio files for browser playback.
Checks both data/clips/ (dataset) and data/uploads/ (live uploads).
Includes Accept-Ranges support for seeking in WaveSurfer.js.

Lane: B
"""

from pathlib import Path
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from app.config import settings

router = APIRouter()


@router.get("/audio/{clip_id}")
async def get_audio(clip_id: str):
    """Serve a WAV audio file for playback."""
    # Sanitize clip_id to prevent path traversal
    safe_id = clip_id.replace("/", "").replace("..", "")

    # Check dataset clips directory first
    clips_dir = settings.resolve_path(settings.CLIPS_DIR)
    clip_path = clips_dir / f"{safe_id}.wav"
    if clip_path.exists():
        return FileResponse(
            path=str(clip_path),
            media_type="audio/wav",
            headers={"Accept-Ranges": "bytes"},
        )

    # Check uploads directory (live uploads)
    uploads_dir = settings.resolve_path(settings.UPLOADS_DIR)
    for ext in (".wav", ".mp3", ".m4a", ".ogg", ".flac"):
        upload_path = uploads_dir / f"{safe_id}{ext}"
        if upload_path.exists():
            media_type = "audio/wav" if ext == ".wav" else "audio/mpeg"
            return FileResponse(
                path=str(upload_path),
                media_type=media_type,
                headers={"Accept-Ranges": "bytes"},
            )

    raise HTTPException(
        status_code=404,
        detail={
            "error": "CLIP_NOT_FOUND",
            "detail": f"No audio file found for clip '{clip_id}'.",
            "hint": "The clip may not have been uploaded or the file is missing from data/clips/.",
        },
    )
