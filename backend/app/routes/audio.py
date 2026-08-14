"""
Audio route — GET /api/audio/{clip_id}

Serves raw WAV audio files for browser playback.
Checks both data/clips/ (dataset) and data/uploads/ (live uploads).
Includes Accept-Ranges support for seeking in WaveSurfer.js.

Lane: B
"""

import re

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from app.config import settings

router = APIRouter()

MEDIA_TYPES = {
    ".wav": "audio/wav",
    ".mp3": "audio/mpeg",
    ".m4a": "audio/mp4",
    ".ogg": "audio/ogg",
    ".flac": "audio/flac",
}
CLIP_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]+$")


@router.get("/audio/{clip_id}")
async def get_audio(clip_id: str):
    """Serve a WAV audio file for playback."""
    if not CLIP_ID_PATTERN.fullmatch(clip_id):
        raise HTTPException(
            status_code=400,
            detail={
                "error": "INVALID_CLIP_ID",
                "detail": "The clip id contains unsupported characters.",
                "hint": "Use only letters, numbers, underscores, and hyphens.",
            },
        )

    # Check dataset clips directory first
    clips_dir = settings.resolve_path(settings.CLIPS_DIR)
    clip_path = clips_dir / f"{clip_id}.wav"
    if clip_path.exists():
        return FileResponse(
            path=str(clip_path),
            media_type="audio/wav",
            headers={"Accept-Ranges": "bytes"},
        )

    # Check uploads directory (live uploads)
    uploads_dir = settings.resolve_path(settings.UPLOADS_DIR)
    for ext, media_type in MEDIA_TYPES.items():
        upload_path = uploads_dir / f"{clip_id}{ext}"
        if upload_path.exists():
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
