# SETUP.md — Environment Setup Guide

> **Follow your OS section step by step.** Don't skip steps.
> After setup, verify with the test command at the bottom.

---

## Prerequisites

| Tool | Version | Check command |
|------|---------|---------------|
| Python | 3.11+ | `python --version` or `python3 --version` |
| Node.js | 18+ | `node --version` |
| npm | 9+ | `npm --version` |
| Git | 2.30+ | `git --version` |
| ffmpeg | any | `ffmpeg -version` (needed for audio processing) |

> **IDE Plugin**: Install the **EditorConfig** plugin in your editor (VS Code has built-in support).
> This ensures consistent indentation and line endings across Windows and macOS via `.editorconfig`.

---

## Lane A Setup (ML/Audio) — Windows with RTX 5070 Ti

### 1. Install ffmpeg

```powershell
# Option 1: winget (recommended)
winget install Gyan.FFmpeg

# Option 2: Download from https://ffmpeg.org/download.html
# Add to PATH
```

Verify: `ffmpeg -version`

### 2. Set up Python virtual environment

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

### 3. Install PyTorch with CUDA 12.8 (for RTX 5070 Ti / Blackwell)

```powershell
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu128
```

> **⚠️ CRITICAL**: The RTX 5070 Ti (Blackwell architecture) requires CUDA 12.8+.
> The default `pip install torch` installs CUDA 12.4 which **silently falls back to CPU**.
> Always use `--index-url https://download.pytorch.org/whl/cu128`.

Verify:
```powershell
python -c "import torch; print(f'CUDA available: {torch.cuda.is_available()}, Version: {torch.version.cuda}, Device: {torch.cuda.get_device_name(0) if torch.cuda.is_available() else \"N/A\"}')"
```

**Expected output**: `CUDA available: True, Version: 12.8, Device: NVIDIA GeForce RTX 5070 Ti Laptop GPU`

If it shows `CUDA available: False`, your torch installation is wrong. Uninstall and reinstall:
```powershell
pip uninstall torch torchvision torchaudio -y
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu128
```

### 4. Install remaining Python dependencies

```powershell
pip install transformers numpy soundfile librosa scipy
pip install ruff   # linter + formatter — run before every commit
```

### 5. Copy environment file

```powershell
Copy-Item backend\.env.example backend\.env
```

Edit `backend\.env`:
- Set `MOCK_ML=0` (you need real models)
- Set `DEVICE=cuda`

### 6. Test the environment

```powershell
python -c "
import torch
import transformers
import soundfile
import numpy
print('All imports successful!')
print(f'torch: {torch.__version__}')
print(f'CUDA: {torch.cuda.is_available()}')
print(f'transformers: {transformers.__version__}')
"
```

---

## Lane B Setup (Backend + Data) — Windows

### 1. Set up Python virtual environment

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

### 2. Install dependencies (no torch needed!)

```powershell
pip install fastapi uvicorn[standard] pydantic pydantic-settings python-multipart
pip install numpy scipy pandas fastf1
pip install ruff   # linter + formatter — run before every commit
```

### 3. Copy environment file

```powershell
Copy-Item backend\.env.example backend\.env
```

Edit `backend\.env`:
- Keep `MOCK_ML=1` (you don't need real models)

### 4. Test the backend boots

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --port 8000
```

Open `http://localhost:8000/api/health` in your browser. Should see:
```json
{"status": "ok", "mock_ml": true, ...}
```

### 5. Install ffmpeg (for scripts, optional)

Only needed if running `scripts/fetch_laps.py`:
```powershell
winget install Gyan.FFmpeg
```

---

## Lane B Setup (Backend + Data) — macOS

### 1. Set up Python virtual environment

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
```

### 2. Install dependencies

```bash
pip install fastapi uvicorn[standard] pydantic pydantic-settings python-multipart
pip install numpy scipy pandas fastf1
```

### 3. Copy environment file

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env`:
- Keep `MOCK_ML=1`

### 4. Test the backend boots

```bash
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload --port 8000
```

---

## Lane C Setup (Frontend) — Windows or macOS

### 1. Create Next.js app (if not already created)

```bash
cd frontend
npx -y create-next-app@latest ./ --typescript --eslint --tailwind --src-dir --app --no-import-alias
```

If the `frontend/` directory already has files from the scaffold, just run:
```bash
cd frontend
npm install
```

### 2. Install additional dependencies

```bash
npm install recharts wavesurfer.js
npm install --save-dev prettier   # code formatter — run before every commit
```

### 3. Copy environment file

```powershell
# Windows
Copy-Item frontend\.env.local.example frontend\.env.local
```

```bash
# macOS
cp frontend/.env.local.example frontend/.env.local
```

Edit `frontend/.env.local`:
- Keep `NEXT_PUBLIC_USE_MOCKS=1` (you don't need a running backend)
- Keep `NEXT_PUBLIC_SHOW_DEV_BANNER=1`

### 4. Test the app runs

```bash
cd frontend
npm run dev
```

Open `http://localhost:3000`. Should show the app (even if it's just the default Next.js page initially).

---

## Common Issues & Fixes

### Windows: "python not found"

Use `python3` instead of `python`, or check your PATH:
```powershell
Get-Command python
```

### Windows: `.ps1 cannot be loaded because running scripts is disabled`

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### macOS: `Command 'python' not found`

macOS only has `python3` by default:
```bash
python3 -m venv .venv
```

### Windows: `soundfile` import error

Install the `libsndfile` dependency:
```powershell
pip install soundfile
```
If it still fails, install the C library:
```powershell
# soundfile on Windows needs no separate C library — the pip package includes it.
# If you see errors, try: pip install --upgrade soundfile
```

### macOS: `librosa` install fails

```bash
brew install libsndfile
pip install librosa
```

### Any OS: `ModuleNotFoundError: No module named 'pydantic_settings'`

```bash
pip install pydantic-settings
```

### Any OS: `uvicorn: command not found`

Make sure your virtual environment is activated:
```powershell
# Windows
.\.venv\Scripts\Activate.ps1
```
```bash
# macOS
source .venv/bin/activate
```

---

## Verification Checklist

After setup, run these checks:

### Lane A
- [ ] `python -c "import torch; print(torch.cuda.is_available())"` → `True`
- [ ] `python -c "import transformers; print(transformers.__version__)"` → version shown
- [ ] `python -c "import soundfile; import numpy; import librosa"` → no errors

### Lane B
- [ ] `uvicorn app.main:app --port 8000` → server starts
- [ ] `curl http://localhost:8000/api/health` → JSON response
- [ ] `pytest tests/test_contract.py` → all pass (once mock data exists)

### Lane C
- [ ] `npm run dev` → server starts on port 3000
- [ ] Open `http://localhost:3000` → page renders
- [ ] `npm run build` → builds without errors
