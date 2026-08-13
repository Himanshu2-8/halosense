# DATASET.md — Data Collection & Labeling Guide

> **This guide tells you which clips to collect, how to process them,
> and how to label them for the evaluation set.**

---

## What We Need

| Data type | Count | Source | Format | Committed? |
|-----------|-------|--------|--------|------------|
| F1 team radio clips | 25–30 | YouTube compilations | 16 kHz mono WAV, <15s each | Yes (`data/clips/`) |
| Metadata | 1 per clip | Hand-written | CSV (`data/metadata.csv`) | Yes |
| Hand labels | All clips | Team effort | CSV (`data/labels.csv`) | Yes |
| Lap times | 1 per driver+race | FastF1 script | JSON (`data/laps/`) | Yes |

---

## Step 1: Collecting Radio Clips

### Source: YouTube

Search for F1 team radio compilations. Good search terms:
- "F1 team radio best moments"
- "F1 funny team radio"
- "F1 angry team radio"
- "Hamilton team radio 2021"
- "Verstappen team radio"

### Recommended clips (emotionally unambiguous, judges will recognize them)

#### STRESSED clips (target: 10–12)

| # | Clip | Driver | Race | Why |
|---|------|--------|------|-----|
| 1 | "Bono, my tyres are gone!" | HAM | Silverstone 2021 | Iconic, high arousal |
| 2 | "No no no no! That was so dangerous!" | VER | Saudi Arabia 2021 | Furious |
| 3 | "What are we doing here, honestly?" | VET | Brazil 2019 | Frustrated |
| 4 | "For what?!" | VET | Canada 2019 | Angry at penalty |
| 5 | "Get out of the way!" | ALO | Various | Impatient, high arousal |
| 6 | "The car is on fire! The car is on fire!" | Various | Various | Panic |
| 7 | "I'm being f***ing torpedoed!" | RIC | Various | Angry collision |
| 8 | "This is unacceptable!" | HAM | Various | Frustrated strategy |
| 9 | "I don't want the position, I want to win!" | ALO | Various | Demanding |
| 10 | "We are checking..." → driver explosion | Various | Various | Frustrated with team |

#### CALM clips (target: 8–10)

| # | Clip | Driver | Race | Why |
|---|------|--------|------|-----|
| 1 | "Leave me alone, I know what I'm doing" | RAI | Abu Dhabi 2012 | Calm, commanding |
| 2 | "Copy, understood" | Various | Various | Neutral acknowledgment |
| 3 | "Good pace, keep pushing" | Various | Various | Normal operational |
| 4 | "Box box box" (calm pit call) | Team → Driver | Various | Routine |
| 5 | "P1, Lewis! P1!" | Team → HAM | Various | Happy but composed |
| 6 | "Thank you everyone" (post-win) | Various | Various | Grateful, calm |
| 7 | "OK copy, we'll talk about it after" | Various | Various | Composed deferral |

#### TIRED clips (target: 5–7)

| # | Clip | Driver | Race | Why |
|---|------|--------|------|-----|
| 1 | Late-race radio, slow speech, long pauses | HAM | Singapore (any) | Heat + fatigue |
| 2 | "I'm struggling out here" (late stint) | Various | Various | Admitting difficulty |
| 3 | Post-race cool-down radio | Various | Various | Exhaustion evident in voice |
| 4 | End of a wet race, slow/cautious | Various | Turkey 2020, etc. | Mentally drained |
| 5 | Long stint on old tyres, resigned tone | Various | Various | Low energy |

### Downloading and processing

#### Option A: YouTube + ffmpeg (recommended)

```bash
# Install yt-dlp (modern youtube-dl fork)
pip install yt-dlp

# Download a full compilation video
yt-dlp -x --audio-format wav -o "data/raw/compilation_%(id)s.%(ext)s" "YOUTUBE_URL"

# Trim a specific clip (start time, duration in seconds)
ffmpeg -i data/raw/compilation_xxx.wav -ss 00:01:23 -t 8 -ar 16000 -ac 1 data/clips/ham_silverstone_2021_l52.wav
```

#### Option B: Record directly

Play the YouTube video, use any audio recording tool, save as WAV.

### Audio specifications (non-negotiable)

| Property | Value | Why |
|----------|-------|-----|
| Format | WAV (.wav) | Lossless, no codec issues |
| Sample rate | 16000 Hz (16 kHz) | Required by both Whisper and audeering models |
| Channels | 1 (mono) | Both models expect mono |
| Bit depth | 16-bit or float32 | Standard |
| Duration | 2–15 seconds | Shorter = noise, longer = mixed emotions |

To convert any audio to the right format:
```bash
ffmpeg -i input.mp3 -ar 16000 -ac 1 output.wav
```

### File naming convention

```
{driver_3letter}_{race_slug}_{lap_or_tag}.wav
```

Examples:
- `ham_silverstone_2021_l52.wav`
- `ver_saudi_arabia_2021_l37.wav`
- `rai_abu_dhabi_2018_l53.wav`
- `vet_canada_2019_penalty.wav`

Rules:
- All lowercase
- Underscores between words
- Use 3-letter driver codes (HAM, VER, RAI, VET, ALO, RIC, NOR, LEC, etc.)
- If you don't know the exact lap, use a descriptive tag

---

## Step 2: Metadata File

### File: `data/metadata.csv`

```csv
clip_id,driver,race,lap,session_type,source_url,notes
ham_silverstone_2021_l52,HAM,Silverstone 2021,52,R,https://youtube.com/...,"Bono my tyres are gone"
rai_abu_dhabi_2018_l53,RAI,Abu Dhabi 2018,53,R,,"Leave me alone"
vet_germany_2018_l52,VET,Germany 2018,52,R,,"Crashed out, post-incident"
ver_saudi_arabia_2021_l37,VER,Saudi Arabia 2021,37,R,,"No no no so dangerous"
```

| Column | Type | Required | Notes |
|--------|------|----------|-------|
| `clip_id` | string | **yes** | Must match the WAV filename without extension |
| `driver` | string | **yes** | 3-letter code (HAM, VER, RAI, etc.) |
| `race` | string | **yes** | Human-readable: "Silverstone 2021" |
| `lap` | int | no | If unknown, leave empty |
| `session_type` | string | no | R (race), Q (qualifying), FP1/FP2/FP3 |
| `source_url` | string | no | YouTube link for reference |
| `notes` | string | no | Brief description |

---

## Step 3: Hand Labels (Evaluation Set)

### File: `data/labels.csv`

```csv
clip_id,human_mood,human_stress_1to5,labeler
ham_silverstone_2021_l52,STRESSED,5,alice
rai_abu_dhabi_2018_l53,CALM,1,alice
vet_germany_2018_l52,TIRED,3,bob
ver_saudi_arabia_2021_l37,STRESSED,5,alice
```

| Column | Type | Required | Notes |
|--------|------|----------|-------|
| `clip_id` | string | **yes** | Must match metadata.csv |
| `human_mood` | string | **yes** | One of: CALM, STRESSED, TIRED |
| `human_stress_1to5` | int | **yes** | 1=very calm, 5=very stressed |
| `labeler` | string | **yes** | Who labeled it (use a nickname) |

### Labeling instructions

Listen to each clip **once** and answer:

1. **Mood**: Is the driver CALM, STRESSED, or TIRED?
   - CALM: normal communication, composed, neutral or positive tone
   - STRESSED: angry, frustrated, panicked, agitated, shouting
   - TIRED: slow speech, long pauses, low energy, resigned tone

2. **Stress level** (1–5):
   - 1 = Very calm, routine
   - 2 = Slightly tense
   - 3 = Noticeably stressed
   - 4 = Very stressed
   - 5 = Extremely stressed (shouting, panicking)

### Tips
- Label based on the VOICE, not what they're saying
- "Leave me alone" sounds calm despite the words
- "My tyres are gone" sounds stressed despite the mundane topic
- If genuinely unsure, pick the closest match — single-annotator labels are inherently subjective, and we'll be upfront about this in the pitch

---

## Step 4: Fetch Lap Data

### When to run

After you have `data/metadata.csv` filled in, run the FastF1 script to get real lap times:

```powershell
# Windows
cd backend
.\.venv\Scripts\Activate.ps1
python ../scripts/fetch_laps.py
```

```bash
# macOS
cd backend
source .venv/bin/activate
python ../scripts/fetch_laps.py
```

This script:
1. Reads sessions from a hardcoded list (edit the `SESSIONS` variable to match your clips)
2. Downloads timing data from the F1 live-timing API (via FastF1)
3. Saves JSON files to `data/laps/`

### First run is slow

The first call to FastF1 downloads ~50–100 MB per session and caches it locally in `backend/.fastf1_cache/`. Subsequent runs are fast.

### What if FastF1 fails?

FastF1 depends on the F1 live-timing API. If it returns errors:
1. Check your internet connection
2. The API sometimes rate-limits — wait 5 minutes and try again
3. Very old sessions (pre-2018) may not have complete data
4. If a specific session fails, skip it and move on — you can manually create a lap JSON with approximate data

---

## Step 5: Precompute Analyses

### When to run

After Lane A's ML pipeline is working, run all clips through it:

```powershell
# Windows (needs GPU — run on the Legion laptop)
cd backend
.\.venv\Scripts\Activate.ps1
python ../scripts/precompute.py
```

This script:
1. Reads `data/metadata.csv` for clip metadata
2. For each clip in `data/clips/`:
   - Runs the full analysis pipeline (ASR → emotion → prosody → fusion)
   - Looks up lap context from `data/laps/`
   - Adds it to `data/cache/analyses.json`
3. Commits the result

### After precompute

The `data/cache/analyses.json` now contains real model output for all clips. This is what the demo runs on — the frontend reads from this file (via the backend's `/api/clips` endpoint) and everything is instant because there's no inference at demo time.

---

## Data Integrity Checklist

Before pushing data files, verify:

- [ ] Every WAV file in `data/clips/` is 16 kHz mono
- [ ] Every WAV file is listed in `data/metadata.csv`
- [ ] Every clip_id in `metadata.csv` has a corresponding WAV in `data/clips/`
- [ ] Every clip_id in `labels.csv` exists in `metadata.csv`
- [ ] Every JSON in `data/laps/` is valid JSON (no NaN, no Infinity)
- [ ] `data/cache/analyses.json` passes `pytest backend/tests/test_contract.py`
- [ ] Total `data/clips/` size is under 15 MB (if over, reduce clip count or quality)

---

## How Much Data Is Enough?

| Quantity | Impact | Recommended? |
|----------|--------|-------------|
| 10 clips | Barely enough for correlation | Minimum viable |
| **25 clips** | Good for demo + basic stats | **Recommended target** |
| 40 clips | Strong correlation analysis | Ideal but time-heavy |
| 50+ clips | Diminishing returns for hackathon | Overkill |

**Our target: 25–30 clips.** This gives us enough data for a meaningful Pearson r while staying within the time budget.
