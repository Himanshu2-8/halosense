"""
Eval route — GET /api/eval

Returns evaluation metrics: model vs hand labels comparison.
Reads from data/labels.csv and compares against analyses.json cache.
Returns 200 with zeros/nulls if no labels exist.

Lane: B
"""

import csv
import logging
from pathlib import Path

from fastapi import APIRouter
from app.config import settings
from app.schemas import EvalSummary

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/eval", response_model=EvalSummary)
async def eval_summary():
    """
    Compare model predictions against hand labels.
    Returns evaluation metrics. Always returns 200 — zeros/nulls if no labels.
    """
    labels_path = settings.resolve_path(settings.LABELS_CSV)

    if not labels_path.exists():
        return EvalSummary(
            n_labeled=0,
            notes="No labels file found at data/labels.csv.",
        )

    # Load hand labels
    hand_labels: dict = {}
    try:
        with open(labels_path, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                clip_id = row.get("clip_id", "").strip()
                human_mood = row.get("human_mood", "").strip().upper()
                if clip_id and human_mood:
                    hand_labels[clip_id] = human_mood
    except Exception as e:
        logger.warning(f"Failed to parse labels.csv: {e}")
        return EvalSummary(notes=f"Failed to parse labels.csv: {e}")

    if not hand_labels:
        return EvalSummary(
            n_labeled=0,
            notes="labels.csv exists but contains no labeled clips.",
        )

    from app.services.cache_service import get_cache
    cache = get_cache()

    # Compare predictions vs labels
    n_labeled = 0
    n_agree = 0
    confusion: dict = {}
    stress_by_label: dict = {}

    for clip_id, human_mood in hand_labels.items():
        if clip_id not in cache:
            continue

        n_labeled += 1
        analysis = cache[clip_id]
        predicted = analysis.get("mood", {}).get("label", "UNKNOWN")
        stress_idx = analysis.get("mood", {}).get("stress_index", 0.0)

        # Agreement
        if predicted == human_mood:
            n_agree += 1

        # Confusion matrix: confusion[predicted][actual]
        if predicted not in confusion:
            confusion[predicted] = {}
        confusion[predicted][human_mood] = confusion[predicted].get(human_mood, 0) + 1

        # Stress by human label
        if human_mood not in stress_by_label:
            stress_by_label[human_mood] = []
        stress_by_label[human_mood].append(float(stress_idx))

    if n_labeled == 0:
        return EvalSummary(
            n_labeled=0,
            notes="No labeled clips found in the cache.",
        )

    agreement_rate = round(n_agree / n_labeled, 3)
    mean_stress = {k: round(sum(v) / len(v), 3) for k, v in stress_by_label.items()}

    return EvalSummary(
        n_labeled=n_labeled,
        agreement_rate=agreement_rate,
        confusion_matrix=confusion if confusion else None,
        mean_stress_by_human_label=mean_stress if mean_stress else None,
        notes=f"Evaluated against {n_labeled} hand-labeled clips. Labels are subjective (single annotator).",
    )
