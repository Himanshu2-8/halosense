# Silent Co-Driver: Detailed Project Overview

## What This Project Does
The **Silent Co-Driver** is an AI-powered system designed for Formula 1 teams that analyzes driver team radio communications to detect stress, fatigue, and emotional states in real-time. By overlaying this emotional context onto real lap-time data, the system reveals how a driver's psychological state correlates with their on-track performance. The application features an interactive dashboard that displays the audio waveform, word-by-word transcript, mood card with contributing factors, and a correlation scatter plot of stress vs. lap time delta.

## Why This Stack
This technology stack was chosen to maximize rapid development, parallelization, and seamless integration between frontend, backend, and machine learning models within a tight hackathon timeframe.

- **Next.js & TypeScript (Frontend):** Provides a robust, component-driven UI with excellent state management, enabling a highly interactive data visualization dashboard.
- **FastAPI (Backend):** Python-based, incredibly fast, and perfect for serving machine learning models with automatic documentation (Swagger) and strong typing (Pydantic).
- **Hugging Face Hub:** Allows us to quickly pull state-of-the-art, pre-trained models for ASR and Speech Emotion Recognition without needing to train from scratch, meeting hackathon requirements.
- **Vercel & HF Docker Spaces:** Allows for separated deployment concerns; Vercel excels at static Next.js deployments, while HF Docker Spaces provide the necessary compute environment for our FastAPI ML backend.

## Services & What They Do
1. **ASR Service (Automatic Speech Recognition):** Handles the transcription of audio clips and crucially extracts word-level timestamps used for downstream prosody analysis.
2. **Emotion Service:** Analyzes the raw audio waveform to predict continuous dimensional emotion scores (Arousal, Valence, Dominance).
3. **Prosody Service:** Computes speech characteristics from the word timestamps and audio data, such as speech rate (words per second), pause ratio, mean pause length, and RMS energy (volume).
4. **Fusion Service:** The core rule-based engine that takes the outputs from the ASR, Emotion, and Prosody services to calculate final Stress and Fatigue indices, ultimately mapping them to a discrete mood label.
5. **Lap Service:** Integrates with the `FastF1` data cache to retrieve lap times, tyre compounds, and track status, computing the lap-time delta against a driver's clean-lap baseline.
6. **Correlation Service:** Computes the Pearson correlation coefficient between the computed stress indices and the lap-time performance deltas across the entire dataset.

## Hugging Face Models Used & How They Are Used

### 1. `openai/whisper-small`
- **Purpose:** Transcription and word-level timestamps.
- **How it's used:** We feed the 16kHz mono audio into Whisper to get the transcript text. More importantly, we use the `return_timestamps="word"` parameter to get exact start and end times for every word spoken. This is essential for calculating speech rate and pauses for our fatigue metrics.

### 2. `audeering/wav2vec2-large-robust-12-ft-emotion-msp-dim`
- **Purpose:** Dimensional Speech Emotion Recognition (SER).
- **How it's used:** Unlike standard models that output discrete classes (e.g., Happy, Sad, Angry), this model evaluates the audio waveform to output continuous scores (0.0 to 1.0) for **Arousal** (energy/activation), **Valence** (positivity/negativity), and **Dominance**. This maps directly onto Russell's circumplex model of affect.

## Formulas & Logic

### Russell's Circumplex Model Integration
We map the continuous arousal and valence scores into quadrants to determine the base emotional state:
- **High Arousal + Negative Valence:** Stressed (e.g., angry, panicked)
- **High Arousal + Positive Valence:** Calm (e.g., focused, pumped)
- **Low Arousal + Negative Valence:** Tired (e.g., dejected, drained)
- **Low Arousal + Positive Valence:** Calm (e.g., relaxed, content)

### Stress Index Formula
Stress is quantified primarily by high energy and negative emotion.
```python
stress_index = arousal * (1.0 - valence)
# Clamped between [0.0, 1.0]
```

### Fatigue Index Formula (Derived Prosody)
"Tired" is not a standard SER label. We derive it using a combination of acoustic and prosodic signals:
```python
fatigue_signals = 0.0
if arousal < 0.4: fatigue_signals += 0.3          # Low energy
if speech_rate_wps < 2.5: fatigue_signals += 0.3  # Slow speech
if pause_ratio > 0.4: fatigue_signals += 0.2      # Lots of pauses
if mean_pause_s > 0.5: fatigue_signals += 0.2     # Long pauses
fatigue_index = min(1.0, fatigue_signals)
```

### Final Mood Verdict
The system evaluates the indices against thresholds (Stress >= 0.55, Fatigue >= 0.50) to output a final label: **STRESSED**, **TIRED**, or **CALM**.

## Complete Execution Flow (After File Upload)

When an audio file is uploaded to the system (or analyzed via the `POST /api/analyze` endpoint), the following precise pipeline is executed:

1. **Audio Loading & Preprocessing:**
   - The file is received by the FastAPI backend.
   - Using `soundfile` and `numpy`, the audio is immediately converted to a 16kHz mono waveform. This standardizes the input for the ML models, using `librosa` for resampling if necessary.

2. **ASR Service (Whisper):**
   - The preprocessed waveform is fed into the `openai/whisper-small` model.
   - **Output:** A text transcript of the audio, alongside precise start and end timestamps for every single word spoken. 

3. **Emotion Service (Wav2Vec2):**
   - The identical waveform is processed through the custom `audeering/wav2vec2` architecture.
   - **Output:** Continuous floating-point scores for Arousal, Dominance, and Valence (each between 0.0 and 1.0).

4. **Prosody Service (Acoustic Feature Extraction):**
   - Utilizing the word timestamps from Step 2, the system calculates the **Speech Rate** (words per second) and **Pause Patterns** (longest pause, mean pause length, pause ratio).
   - It also measures raw acoustic features like RMS Energy (loudness) directly from the audio array, and optionally, pitch (median F0).

5. **Fusion Service (Decision Engine):**
   - The engine aggregates the data from Steps 3 and 4.
   - It calculates the **Stress Index** based on high arousal and negative valence.
   - It calculates the **Fatigue Index** based on slow speech rate, extended pauses, and low arousal.
   - It applies the rule-based thresholds to assign the definitive mood label (STRESSED, TIRED, or CALM), along with contributing factor flags (e.g., "fast_speech", "high_volume").

6. **Lap Context Integration (FastF1):**
   - If the audio clip contains metadata identifying the driver, race, and lap, the backend fetches the corresponding JSON dump generated by the `FastF1` library.
   - It calculates the driver's lap-time delta compared to their average clean lap.

7. **Client Response:**
   - The aggregated `ClipAnalysis` JSON payload is returned to the Next.js frontend.
   - The UI immediately updates to render the interactive waveform (WaveSurfer.js), the synchronized transcript, the categorized mood card, and plots the new data point on the correlation and lap charts.
