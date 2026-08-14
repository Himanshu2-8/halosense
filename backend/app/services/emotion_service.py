"""
Emotion Service — Dimensional emotion from speech using audeering wav2vec2.

Model: audeering/wav2vec2-large-robust-12-ft-emotion-msp-dim
Input: 1D float32 numpy waveform at 16kHz
Output: {"arousal": float, "dominance": float, "valence": float}

⚠️ This model has NO AutoModel support. Custom classes are REQUIRED.

Lane: A
"""

import logging

import numpy as np
import torch
import torch.nn as nn
from transformers import Wav2Vec2Model, Wav2Vec2PreTrainedModel, Wav2Vec2Processor

logger = logging.getLogger(__name__)

MODEL_ID = "audeering/wav2vec2-large-robust-12-ft-emotion-msp-dim"


# ─────────────────────────────────────────────────────────────────────
# Custom model classes — REQUIRED for the audeering model.
# Do NOT delete these. There is no alternative.
# ─────────────────────────────────────────────────────────────────────


class RegressionHead(nn.Module):
    """Regression head for dimensional emotion prediction."""

    def __init__(self, config):
        super().__init__()
        self.dense = nn.Linear(config.hidden_size, config.hidden_size)
        self.dropout = nn.Dropout(config.final_dropout)
        self.out_proj = nn.Linear(config.hidden_size, config.num_labels)

    def forward(self, features, **kwargs):
        x = features
        x = self.dropout(x)
        x = self.dense(x)
        x = torch.tanh(x)
        x = self.dropout(x)
        x = self.out_proj(x)
        return x


class EmotionModel(Wav2Vec2PreTrainedModel):
    """wav2vec2 model with a regression head for dimensional emotion."""

    @property
    def all_tied_weights_keys(self):
        # Workaround for transformers>=4.40 trying to access this attribute
        return {}

    def __init__(self, config):
        super().__init__(config)
        self.config = config
        self.wav2vec2 = Wav2Vec2Model(config)
        self.classifier = RegressionHead(config)
        self.init_weights()

    def forward(self, input_values):
        outputs = self.wav2vec2(input_values)
        hidden_states = outputs.last_hidden_state
        hidden_states = torch.mean(hidden_states, dim=1)
        logits = self.classifier(hidden_states)
        return hidden_states, logits


# ─────────────────────────────────────────────────────────────────────
# Lazy-loaded singletons
# ─────────────────────────────────────────────────────────────────────

_processor = None
_model = None


def models_loaded() -> bool:
    """Report whether the emotion processor and model are initialized."""
    return _processor is not None and _model is not None


def _load_model(device: str):
    """Load the audeering model and processor once."""
    global _processor, _model
    if _model is not None:
        return _processor, _model

    logger.info(f"Loading emotion model ({MODEL_ID})...")
    _processor = Wav2Vec2Processor.from_pretrained(MODEL_ID)
    _model = EmotionModel.from_pretrained(MODEL_ID)

    resolved = device
    if device == "auto":
        resolved = "cuda" if torch.cuda.is_available() else "cpu"

    _model = _model.to(resolved)
    _model.eval()
    logger.info(f"Emotion model loaded on {resolved}.")
    return _processor, _model


def analyze_emotion(
    waveform: np.ndarray,
    sr: int = 16000,
    device: str = "auto",
) -> dict:
    """
    Analyze dimensional emotion from a waveform.

    Args:
        waveform: 1D numpy float32 array, mono audio
        sr: Sample rate (must be 16000)
        device: "auto" | "cuda" | "mps" | "cpu"

    Returns:
        {"arousal": float, "dominance": float, "valence": float}
        Each value is 0.0–1.0.
    """
    processor, model = _load_model(device)

    # Ensure correct shape and dtype
    if waveform.ndim > 1:
        waveform = waveform.mean(axis=1)
    waveform = waveform.astype(np.float32)

    # Process
    inputs = processor(waveform, sampling_rate=sr, return_tensors="pt", padding=True)

    dev = next(model.parameters()).device
    input_values = inputs["input_values"].to(dev)

    with torch.no_grad():
        _, logits = model(input_values)

    # logits shape: (1, 3) → [arousal, dominance, valence]
    scores = logits[0].cpu().numpy()

    arousal = float(max(0.0, min(1.0, scores[0])))
    dominance = float(max(0.0, min(1.0, scores[1])))
    valence = float(max(0.0, min(1.0, scores[2])))

    return {
        "arousal": round(arousal, 4),
        "dominance": round(dominance, 4),
        "valence": round(valence, 4),
    }
