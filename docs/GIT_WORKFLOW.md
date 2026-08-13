# GIT_WORKFLOW.md — Branch Strategy & Push/Pull Protocol

> **Three people, three branches, one merge.** Follow this exactly.

---

## Branch Structure

```
main                          ← Always working. Never push broken code here.
├── lane-a/ml-pipeline        ← Lane A's ML services
├── lane-b/backend-data       ← Lane B's backend + data
└── lane-c/frontend           ← Lane C's frontend
```

**Rule**: Each person works ONLY on their branch. Never commit to `main` directly during the solo build phase.

---

## Workflow Step by Step

### 1. Initial setup (done once, by the repo creator)

```bash
# Create the GitHub repo (public)
# Clone it locally
git clone https://github.com/<your-org>/AI_Race_GrandPrix.git
cd AI_Race_GrandPrix

# Push the existing docs and config files
git add .
git commit -m "docs: planning docs, contract, config files"
git push origin main
```

### 2. Each person creates their branch

```bash
# After cloning:
git checkout main
git pull origin main

# Create your branch
git checkout -b lane-a/ml-pipeline     # Lane A
# or
git checkout -b lane-b/backend-data    # Lane B
# or
git checkout -b lane-c/frontend        # Lane C
```

### 3. During solo build — commit frequently, push when done

```bash
# Work on your files...
git add backend/app/services/asr_service.py
git commit -m "feat(lane-a): ASR service with word timestamps"

# More work...
git add backend/app/services/emotion_service.py
git commit -m "feat(lane-a): emotion service with audeering model"

# When your lane is complete:
git push origin lane-a/ml-pipeline
```

**Commit message format**:
```
feat(lane-X): short description
fix(lane-X): what was broken
docs: documentation changes
```

### 4. Integration merge (done by one person)

**⚠️ Do this in the exact order specified. It matters.**

```bash
git checkout main
git pull origin main

# 1. Merge Lane B first (creates the app skeleton that Lane A depends on)
git merge origin/lane-b/backend-data --no-ff -m "merge: Lane B - backend + data"

# 2. Merge Lane A (adds ML services to the existing backend)
git merge origin/lane-a/ml-pipeline --no-ff -m "merge: Lane A - ML pipeline"

# 3. Merge Lane C (entirely separate directory, zero conflicts)
git merge origin/lane-c/frontend --no-ff -m "merge: Lane C - frontend"

# 4. Push
git push origin main
```

### 5. After merge — everyone pulls main

```bash
git checkout main
git pull origin main
```

---

## Rules

### Do's
- ✅ Commit often (every 30–60 min of work)
- ✅ Write descriptive commit messages
- ✅ Push your branch before the integration checkpoint (20:00 Aug 13)
- ✅ Run `ruff format . && ruff check --fix .` before committing (Lane A, B)
- ✅ Run `pytest backend/tests/test_contract.py` before pushing (Lane B)
- ✅ Run `npx prettier --write .` before committing (Lane C)
- ✅ Run `npm run build` before pushing (Lane C)

### Don'ts
- ❌ Don't push to `main` during solo build
- ❌ Don't edit files outside your lane
- ❌ Don't commit `.env`, `.env.local`, `node_modules/`, `.venv/`, `__pycache__/`
- ❌ Don't commit model weights (`.safetensors`, `.bin`, `.pt`)
- ❌ Don't force push (`git push -f`) — ever
- ❌ Don't rebase shared branches

### If a conflict happens

1. Check which file conflicts
2. The person who OWNS that file (per lane assignment in CLAUDE.md) is the authority
3. Accept their version
4. If both lanes need changes in a shared file (unlikely by design), merge manually

### Shared files (anyone may edit, but announce first)

These files are not owned by any single lane:
- `README.md`
- `CLAUDE.md`
- `docs/` (all planning docs)
- `.gitignore`
- `docker-compose.yml`

**Rule**: Before editing a shared file, message the group chat. Don't silently change something others might have open.

---

## Post-Hackathon: Untracking Planning Docs

After the hackathon, you may want to untrack the planning docs from Git while keeping them locally:

```bash
# Remove from Git tracking but keep on disk
git rm --cached docs/AGENTS.md
git rm --cached docs/CONTRACT.md
git rm --cached docs/IMPLEMENTATION.md
git rm --cached docs/ROADMAP.md
git rm --cached docs/ROUTES.md
git rm --cached docs/SERVICES.md
git rm --cached docs/SETUP.md
git rm --cached docs/GIT_WORKFLOW.md
git rm --cached docs/DATASET.md
git rm --cached CLAUDE.md

# Add them to .gitignore
echo "docs/*.md" >> .gitignore
echo "CLAUDE.md" >> .gitignore

git add .gitignore
git commit -m "chore: untrack planning docs"
```

---

## GitHub Repo Settings (recommended)

- **Visibility**: Public (required for submission)
- **Default branch**: `main`
- **Description**: "AI-powered F1 driver stress detection from team radio audio — Hackathon submission for AI Race GrandPrix"
- **Topics**: `hackathon`, `f1`, `speech-emotion-recognition`, `huggingface`, `fastapi`, `nextjs`
