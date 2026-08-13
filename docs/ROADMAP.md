# ROADMAP.md — Timeline, Lane Assignments & Merge Protocol

> **This is the schedule.** Everyone reads this, knows their deadlines,
> and knows when to push/pull. Miss a checkpoint and the whole build slips.

---

## Deadlines (fixed, non-negotiable)

| Deadline | Date & Time | What's due |
|----------|-------------|------------|
| **Form submission** | Aug 14, 23:59 IST | GitHub link, PPT link, demo video link |
| **Enhancement window** | Aug 15, end of day | Deploy live, polish, bug fixes |
| **Stage 2 (if selected)** | Aug 22 | Live demo + pitch at Paytm Noida |

---

## Team of 3 — Lane Assignments

| Lane | Scope | Files owned | Estimated hours |
|------|-------|-------------|----------------|
| **A — ML/Audio** | ML inference pipeline: ASR (Whisper), Emotion (audeering), Prosody features, Mood fusion | `backend/app/services/asr_service.py`, `emotion_service.py`, `prosody_service.py`, `fusion_service.py` | 5–6 hrs |
| **B — Backend + Data** | FastAPI app shell, all routes, schemas, cache service, lap service, correlation service, contract tests, FastF1 scripts, data collection | `backend/app/main.py`, `config.py`, `schemas.py`, `routes/*`, `services/cache_service.py`, `lap_service.py`, `correlation_service.py`, `tests/*`, `scripts/*`, `data/*` | 5–6 hrs |
| **C — Frontend** | Next.js app, all components, styling, mock data, api layer | `frontend/` (entire directory) | 6–7 hrs |

### Hardware allocation

| Lane | Machine | Why |
|------|---------|-----|
| A | Lenovo Legion (RTX 5070 Ti) | Needs GPU for Whisper + audeering model |
| B | Any (HP ProBook or any laptop) | No GPU needed, runs with `MOCK_ML=1` |
| C | Any (MacBook Air or any laptop) | No Python needed, just Node.js |

---

## Timeline — Hour by Hour

### Phase 1: Setup & Planning (Aug 13, 12:00–13:00) — 1 hour

**Everyone together** (in-person or call):

- [ ] Read `CLAUDE.md` (2 min)
- [ ] Read `docs/CONTRACT.md` (10 min) — everyone reads the whole thing
- [ ] Read your lane's section in `docs/IMPLEMENTATION.md` (10 min)
- [ ] Create GitHub repo, push current docs
- [ ] Each person clones, creates their branch:
  - Lane A: `git checkout -b lane-a/ml-pipeline`
  - Lane B: `git checkout -b lane-b/backend-data`
  - Lane C: `git checkout -b lane-c/frontend`
- [ ] Each person sets up their environment (see `docs/SETUP.md`)
- [ ] Verify everyone has a HuggingFace account
- [ ] **Last sync before solo work**: confirm the plan, exchange phone numbers for emergencies

### Phase 2: Solo Build (Aug 13, 13:00–20:00) — 7 hours

**Everyone works independently on their lane. No coordination needed.**

The whole point of CONTRACT.md is that you don't need to talk to each other during this phase. If you find yourself wanting to ask "what format should X be?", the answer is in CONTRACT.md.

#### Lane A — ML Pipeline (7 hours)

| Time | Task | Deliverable |
|------|------|------------|
| 13:00–14:00 | Set up Python env, install torch+transformers, verify CUDA works | `torch.cuda.is_available() == True` |
| 14:00–15:30 | Build `asr_service.py` — Whisper pipeline with word timestamps | Working `transcribe()` function |
| 15:30–17:00 | Build `emotion_service.py` — audeering custom model classes + inference | Working `analyze_emotion()` function |
| 17:00–17:30 | Build `prosody_service.py` — speech rate, pauses, energy, pitch | Working `compute_prosody()` function |
| 17:30–18:30 | Build `fusion_service.py` — mood rules + orchestrator | Working `analyze_audio()` end-to-end |
| 18:30–19:00 | Test on 3–5 clips manually, fix edge cases | All clips produce valid output |
| 19:00–19:30 | **PUSH** to `lane-a/ml-pipeline` | All 4 service files committed |
| 19:30–20:00 | Help with data collection (record clips, etc.) | — |

#### Lane B — Backend + Data (7 hours)

| Time | Task | Deliverable |
|------|------|------------|
| 13:00–13:30 | Set up Python env, install fastapi/uvicorn/pydantic | `pip list` shows all deps |
| 13:30–14:30 | Create `schemas.py` (all Pydantic models from CONTRACT.md) + `config.py` | Models validate |
| 14:30–15:00 | Create `cache_service.py` + initial `data/cache/analyses.json` (5 mock clips) | Mock data loads |
| 15:00–15:30 | Create `main.py` + route files: `health.py`, `clips.py` | `GET /api/health` and `GET /api/clips` work |
| 15:30–16:00 | Create `analyze.py` route (with MOCK_ML=1 path) | `POST /api/analyze` works with mock |
| 16:00–16:30 | Create `audio.py` route + `laps.py` route | Audio files serve, laps route works |
| 16:30–17:00 | Create `lap_service.py` + `correlation_service.py` | All services work |
| 17:00–17:30 | Create `correlation.py` route + `eval_route.py` | All 8 routes working |
| 17:30–18:00 | Create `test_contract.py`, run tests | All tests pass |
| 18:00–19:00 | Run `scripts/fetch_laps.py` to get real FastF1 data | `data/laps/*.json` committed |
| 19:00–19:30 | Create `data/metadata.csv` + `data/labels.csv` | Data files committed |
| 19:30–20:00 | **PUSH** to `lane-b/backend-data` | Full backend committed |

#### Lane C — Frontend (7 hours)

| Time | Task | Deliverable |
|------|------|------------|
| 13:00–13:30 | Run `create-next-app`, install deps (recharts, wavesurfer) | Next.js app boots |
| 13:30–14:00 | Create `types.ts`, `mock.ts` (5 clips), `api.ts` | Mock data renders |
| 14:00–14:30 | Create layout (`layout.tsx`) + dark theme + Google Fonts | App looks professional |
| 14:30–15:30 | Build `Sidebar.tsx` — clip list with mood pills, search/filter | Sidebar renders with mock data |
| 15:30–16:30 | Build `MoodCard.tsx` — the hero visual, big label, confidence, factors | Mood card renders correctly |
| 16:30–17:00 | Build `TranscriptView.tsx` — word-by-word display | Transcript renders |
| 17:00–18:00 | Build `LapChart.tsx` — Recharts line chart with markers | Chart renders with mock window data |
| 18:00–18:30 | Build `CorrelationPlot.tsx` — scatter chart | Scatter plot renders |
| 18:30–19:00 | Build `UploadPanel.tsx` — drag-and-drop + display result | Upload UI works (mock mode) |
| 19:00–19:30 | Build `AudioPlayer.tsx` — WaveSurfer.js OR simple HTML5 audio | Audio player renders |
| 19:30–20:00 | Polish: animations, responsive, `DevBanner.tsx` | App looks great |
| 20:00 | **PUSH** to `lane-c/frontend` | Full frontend committed |

### Phase 3: Integration (Aug 13, 20:00–22:00) — 2 hours

**Everyone together** (critical — do NOT skip this):

| Time | Task | Who |
|------|------|-----|
| 20:00–20:15 | Merge all branches into `main` (see below) | Git person |
| 20:15–20:30 | Run `pytest backend/tests/test_contract.py` | Lane B |
| 20:30–21:00 | Test backend with `MOCK_ML=0`, fix any import/path issues | Lane A + B |
| 21:00–21:30 | Test frontend with `NEXT_PUBLIC_USE_MOCKS=0`, fix API calls | Lane C |
| 21:30–22:00 | End-to-end test: select clip → see real analysis → chart renders | Everyone |

### Phase 4: Data & Polish (Aug 14, morning) — 3 hours

| Time | Task | Who |
|------|------|-----|
| 09:00–10:00 | Collect 20–25 more radio clips from YouTube (if not done) | Anyone |
| 10:00–11:00 | Run `scripts/precompute.py` on all clips, commit results | Lane A (has GPU) |
| 11:00–12:00 | Hand-label clips in `data/labels.csv`, update `analyses.json` | Lane B |
| 12:00–12:30 | Final UI polish, fix any rendering issues | Lane C |

### Phase 5: Demo & Submission (Aug 14, afternoon) — 3 hours

| Time | Task | Who |
|------|------|-----|
| 13:00–14:00 | Record demo video (90–120 seconds) | Lane A or C |
| 14:00–15:00 | Create PPT (8–10 slides, see below) | Lane B |
| 15:00–16:00 | Upload video, finalize GitHub README | Everyone |
| 16:00–16:30 | **SUBMIT THE FORM** — don't wait until 23:59 | Anyone |

### Phase 6: Deployment (Aug 15) — 2 hours

| Time | Task | Who |
|------|------|-----|
| Anytime | Deploy frontend to Vercel | Lane C |
| Anytime | Deploy backend to HuggingFace Docker Space | Lane B |
| Anytime | Test deployed URLs end-to-end | Everyone |

---

## Merge Protocol

### Branch naming

```
main                     ← production, always working
├── lane-a/ml-pipeline   ← Lane A's work
├── lane-b/backend-data  ← Lane B's work
└── lane-c/frontend      ← Lane C's work
```

### Merge order (critical — do it in this exact order)

```bash
# 1. Everyone pushes their branch first
# (each person does this from their lane branch)
git push origin lane-a/ml-pipeline     # Lane A
git push origin lane-b/backend-data    # Lane B
git push origin lane-c/frontend        # Lane C

# 2. One person (the Git person) merges into main
git checkout main
git pull origin main

# Step 1: Merge Lane B first (it has schemas, routes, data)
git merge origin/lane-b/backend-data --no-ff -m "merge: Lane B - backend + data"

# Step 2: Merge Lane A (ML services into backend/app/services/)
git merge origin/lane-a/ml-pipeline --no-ff -m "merge: Lane A - ML pipeline"

# Step 3: Merge Lane C (frontend — zero conflicts expected)
git merge origin/lane-c/frontend --no-ff -m "merge: Lane C - frontend"

# 3. Push merged main
git push origin main

# 4. Everyone pulls main
# (each person does this)
git checkout main
git pull origin main
```

### Why this order?

- **Lane B first** because it creates `backend/app/schemas.py`, `config.py`, `__init__.py`, and the `services/__init__.py` that Lane A depends on
- **Lane A second** because it only adds files in `backend/app/services/` — no conflicts with Lane B's files
- **Lane C last** because `frontend/` is a completely separate directory — literally zero conflicts possible

### Conflict resolution

If somehow a conflict occurs:
1. **Don't panic.** The lane split was designed to prevent conflicts.
2. The most likely conflict is `backend/app/services/__init__.py` — both Lane A and B might create it. Solution: keep whichever version has more content, or merge both.
3. For any other conflict: the person who owns the file (per lane assignment) is the authority.

---

## PPT Structure (8–10 slides)

| Slide | Content |
|-------|---------|
| 1 | Title: "Silent Co-Driver — AI-Powered F1 Driver Stress Detection" |
| 2 | The Problem: Driver stress impacts performance, but radio analysis is manual |
| 3 | Our Solution: Multi-modal audio analysis pipeline |
| 4 | Architecture diagram (from AGENTS.md §3) |
| 5 | The Science: Russell's circumplex model, dimensional emotion vs discrete |
| 6 | Our Innovation: Derived fatigue detection from speech prosody |
| 7 | Results: Correlation scatter plot + headline statistic |
| 8 | Live Demo screenshot or demo video embed |
| 9 | Tech stack: HuggingFace models used, FastF1 data |
| 10 | Future work: real-time streaming, multi-language, team-specific calibration |

## Demo Video Script (90 seconds)

```
0:00–0:10  "Silent Co-Driver analyzes F1 team radio to detect driver stress in real time."
0:10–0:25  Show the dashboard. Click on "HAM - Silverstone 2021" in the sidebar.
0:25–0:40  Audio plays, waveform animates, transcript appears word by word.
0:40–0:55  "The mood card shows STRESSED with 84% confidence. Contributing factors:
            high arousal, negative valence, fast speech."
0:55–1:10  "The lap chart shows a 1.2-second dropoff on this exact lap."
1:10–1:20  Switch to correlation view. "Across 28 clips, stress correlates with 
            lap-time loss at r=0.61."
1:20–1:30  Upload a new clip. Show real-time analysis.
```

---

## Emergency Fallbacks

If you're behind schedule, cut in this order:

| Priority | What to cut | Impact |
|----------|-------------|--------|
| 1 | Drop `AudioPlayer` (WaveSurfer) — use HTML5 `<audio>` instead | Saves 1 hour, minor visual loss |
| 2 | Drop `CorrelationPlot` — just show the headline text | Saves 30 min |
| 3 | Drop `ArousalValenceGauge` — it's cool but not essential | Saves 30 min |
| 4 | Drop live upload (`UploadPanel`) — demo from precomputed cache only | Saves 1 hour, but keeps Rule 1 satisfied via the route existing |
| 5 | Drop `eval_route` — nobody will ask for it at qualifier stage | Saves 30 min |

**Never cut**: MoodCard, Sidebar, LapChart, TranscriptView — these are the demo.

---

## Success Criteria

Before submitting, verify:

- [ ] `pytest backend/tests/test_contract.py` — all pass
- [ ] Backend boots with `MOCK_ML=0` and serves real data
- [ ] Frontend renders real data from the backend
- [ ] At least 15 clips in `data/cache/analyses.json` with real model output
- [ ] Demo video recorded (90–120 seconds)
- [ ] GitHub repo is public
- [ ] README.md explains the project
- [ ] All team members have HuggingFace accounts
- [ ] PPT created (even minimal)
- [ ] Google Form submitted before 23:59 Aug 14
