"""
Clips routes — GET /api/clips and GET /api/clips/{clip_id}

GET /api/clips       → ClipSummary[] (with optional driver/mood filters)
GET /api/clips/{id}  → ClipAnalysis (full payload)

Lane: B
"""

from fastapi import APIRouter, Query, HTTPException
from app.services.cache_service import get_available_cache
from app.schemas import ClipSummary, ClipAnalysis

router = APIRouter()


@router.get("/clips", response_model=list[ClipSummary])
async def list_clips(
    driver: str | None = Query(None, description="Filter by 3-letter driver code, e.g. HAM"),
    mood: str | None = Query(None, description="Filter by mood: CALM, STRESSED, TIRED, UNKNOWN"),
):
    """Return a list of all analyzed clips, with optional filters."""
    # Validate mood param
    if mood and mood not in ("CALM", "STRESSED", "TIRED", "UNKNOWN"):
        raise HTTPException(
            status_code=400,
            detail={
                "error": "INVALID_PARAM",
                "detail": f"'{mood}' is not a valid mood label.",
                "hint": "Use one of: CALM, STRESSED, TIRED, UNKNOWN",
            },
        )

    cache = get_available_cache()
    results = []
    for clip_id, analysis in cache.items():
        # Apply filters
        if driver and analysis.get("driver") != driver:
            continue
        if mood and analysis.get("mood", {}).get("label") != mood:
            continue

        # Build summary
        transcript = analysis.get("transcript", "")
        preview = (transcript[:57] + "...") if len(transcript) > 60 else transcript

        lap_context = analysis.get("lap_context")
        delta_s = lap_context.get("delta_s") if lap_context else None

        results.append(
            ClipSummary(
                clip_id=clip_id,
                driver=analysis.get("driver"),
                race=analysis.get("race"),
                lap=analysis.get("lap"),
                duration_s=analysis["prosody"]["duration_s"],
                mood_label=analysis["mood"]["label"],
                stress_index=analysis["mood"]["stress_index"],
                delta_s=delta_s,
                transcript_preview=preview,
                audio_url=f"/api/audio/{clip_id}",
            )
        )

    return results


@router.get("/clips/{clip_id}", response_model=ClipAnalysis)
async def get_clip(clip_id: str):
    """Return full analysis for a single clip."""
    cache = get_available_cache()
    if clip_id not in cache:
        raise HTTPException(
            status_code=404,
            detail={
                "error": "CLIP_NOT_FOUND",
                "detail": f"No clip with id '{clip_id}'.",
                "hint": "Check GET /api/clips for available clip_ids.",
            },
        )
    return cache[clip_id]


@router.delete("/clips/{clip_id}")
async def delete_clip(clip_id: str):
    """Delete a custom uploaded clip."""
    from app.services.cache_service import get_cache, remove_from_cache
    from app.config import settings
    
    cache = get_cache()
    if clip_id not in cache:
        raise HTTPException(status_code=404, detail="Clip not found")
        
    analysis = cache[clip_id]
    if analysis.get("source") != "UPLOAD" and not clip_id.startswith("upload_"):
        raise HTTPException(status_code=403, detail="Only custom uploads can be deleted.")
        
    remove_from_cache(clip_id)
    
    uploads_dir = settings.resolve_path(settings.UPLOADS_DIR)
    for ext in (".wav", ".mp3", ".m4a", ".ogg", ".flac"):
        file_path = uploads_dir / f"{clip_id}{ext}"
        if file_path.exists():
            try:
                file_path.unlink()
            except:
                pass
                
    return {"status": "ok", "message": f"Deleted {clip_id}"}
