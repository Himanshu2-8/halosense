# CLAUDE.md — Project Context for AI Agents

> **Read this file first.** It tells you what this project is, where to find
> the detailed docs, and what rules to follow.

## Project: Silent Co-Driver

**Hackathon**: AI Race GrandPrix (Mphasis × HuggingFace)
**Problem Statement**: PS1 — The Silent Co-Driver
**Deadline**: Form submission by Aug 14, 23:59. Deployment by Aug 15.
**Team size**: 3 people, working independently and merging via Git.

### What it does (one paragraph)

Takes F1 team radio audio clips, runs ASR (Whisper) + speech emotion
recognition (audeering wav2vec2 arousal/valence/dominance) + custom prosody
features (speech rate, pause ratio from Whisper word timestamps), fuses them
into a stress/fatigue verdict using Russell's circumplex model, and overlays
the result on real lap-time data from FastF1. The frontend shows an audio
player, transcript, mood card, and interactive lap chart with stress markers.

### Tech stack

| Layer    | Technology                    |
|----------|-------------------------------|
| Frontend | Next.js 14 (App Router), TypeScript, Recharts, WaveSurfer.js |
| Backend  | FastAPI, Python 3.11+, Pydantic v2 |
| ML       | openai/whisper-small, audeering/wav2vec2-large-robust-12-ft-emotion-msp-dim (HF Hub) |
| Data     | FastF1 (lap times), hand-collected radio clips |
| Deploy   | Vercel (frontend), HuggingFace Docker Space (backend) |

### Team lanes (file ownership)

| Lane | Scope | Owns these paths (nobody else touches) |
|------|-------|---------------------------------------|
| **A — ML/Audio** | ML inference pipeline | `backend/app/services/asr_service.py`, `backend/app/services/emotion_service.py`, `backend/app/services/prosody_service.py`, `backend/app/services/fusion_service.py` |
| **B — Backend + Data** | API routes, data layer, scripts | `backend/app/main.py`, `backend/app/config.py`, `backend/app/schemas.py`, `backend/app/routes/`, `backend/app/services/cache_service.py`, `backend/app/services/lap_service.py`, `backend/app/services/correlation_service.py`, `backend/tests/`, `scripts/`, `data/` |
| **C — Frontend** | Next.js UI | `frontend/` (entire directory) |

> **Shared files** (anyone may edit, but announce first): `docs/`, `CLAUDE.md`,
> `.gitignore`, `README.md`, `docker-compose.yml`.

### Essential planning docs

Read these in order:

1. **[docs/CONTRACT.md](docs/CONTRACT.md)** — The frozen data contract. All JSON shapes, enums, error codes. **This is the single most important file.**
2. **[docs/AGENTS.md](docs/AGENTS.md)** — Project bible: architecture, folder structure, every detail.
3. **[docs/ROUTES.md](docs/ROUTES.md)** — Every API endpoint: method, path, params, request/response, errors.
4. **[docs/SERVICES.md](docs/SERVICES.md)** — Every backend service: input, output, logic, code snippets.
5. **[docs/IMPLEMENTATION.md](docs/IMPLEMENTATION.md)** — Step-by-step build guide per lane, with exact code.
6. **[docs/ROADMAP.md](docs/ROADMAP.md)** — Hour-by-hour timeline, merge checkpoints, integration order.
7. **[docs/SETUP.md](docs/SETUP.md)** — Environment setup for Windows and macOS.
8. **[docs/GIT_WORKFLOW.md](docs/GIT_WORKFLOW.md)** — Branch strategy, push/pull protocol.
9. **[docs/DATASET.md](docs/DATASET.md)** — Which clips to collect, metadata format, labeling guide.

### Coding standards

| Practice | Rule |
|----------|------|
| **Virtual env** | Always use `.venv`. Never install into system Python. Activate before every command. |
| **Python formatting** | Run `ruff format .` and `ruff check --fix .` before committing. Config: `backend/pyproject.toml`. |
| **TypeScript formatting** | Run `npx prettier --write .` in `frontend/` before committing. |
| **Paths** | Use `pathlib.Path` in Python, never string concatenation with `\\` or `/`. Windows and macOS teammates must both work. |
| **Logging** | Use `logging.getLogger(__name__)`, never `print()`. Demo output must be clean — stray prints pollute it. |
| **Error handling** | Never bare `except:`. Always `except SomeError as e:` with a log. |
| **EditorConfig** | `.editorconfig` at repo root enforces indent/line-endings. Install the EditorConfig plugin in your IDE if it's not built-in. |
| **Dependencies** | Pin major versions in `requirements.txt`. Commit `package-lock.json`. |
| **Imports** | Standard library → third-party → local, separated by blank lines. Ruff enforces this. |

### Rules for AI agents working on this repo

1. **Read the CONTRACT first.** All JSON shapes are frozen. Do not invent new field names.
2. **Stay in your lane.** Only modify files your lane owns (see table above).
3. **`snake_case` for JSON, Python.** `camelCase` for TypeScript/JS variables (but JSON keys are still `snake_case`).
4. **No NaN in JSON.** Use `null` / `None`. See CONTRACT §9.
5. **Times are `float` seconds.** Never milliseconds, never strings, never Timedelta.
6. **Scores are `0.0`–`1.0` floats.** Always.
7. **Test before pushing.** Run `pytest backend/tests/test_contract.py`.
8. **MOCK_ML=1 for non-ML work.** Only Lane A needs real models loaded.
9. **Do not add dependencies without announcing.** Especially heavy ones (torch, etc.).
10. **Commit the `.env.example` files, never the `.env` files.**
11. **Use `pathlib.Path`** for all file paths. Never hardcode `/` or `\\`.
12. **Use `logging`**, never `print()`. Set up logger at top of each module.
13. **Run `ruff format . && ruff check --fix .`** before every commit (Python).
14. **Run `npx prettier --write .`** before every commit (Frontend).

### Pre-push checklist

Before every `git push`, run through this:

```
# Lane A / B (Python):
cd backend
ruff format .
ruff check --fix .
pytest tests/test_contract.py

# Lane C (Frontend):
cd frontend
npx prettier --write .
npm run build        # must succeed with zero errors
```
