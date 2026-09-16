# EvalAI — Intelligent Assessment & Project Evaluation Platform

A **full-stack** AI-powered academic assessment and project-evaluation platform.

- **Frontend** (this folder): React + TypeScript + Vite + Tailwind. Talks to the real API.
- **Backend** (`backend/`): FastAPI + SQLAlchemy + Alembic + Argon2/JWT + Celery. Real DB,
  real auth, secure ZIP handling, isolated SQL test execution, pluggable AI provider
  (Anthropic / OpenAI / deterministic Mock).

The frontend calls the backend for everything — login, syllabus processing, question
generation, scenario distribution, submissions, the staged AI-evaluation pipeline,
manual grading and publishing. There is no mock data left in the running app.

---

## Run the working system (2 terminals)

### 1 — Backend  (`backend/`)

A Python 3.12 virtualenv is already set up at `backend/.venv` (your system Python is 3.14,
which can't build pydantic-core — use this venv, don't recreate it with `python`).

```bash
cd backend

# one-time: create tables + demo data (SQLite, no Postgres/Redis needed)
.venv\Scripts\python.exe -m alembic upgrade head
.venv\Scripts\python.exe -m scripts.seed

# run the API  (http://localhost:8000  ·  docs at /docs)
.venv\Scripts\python.exe -m uvicorn app.main:app --reload
```

`backend/.env` is already configured for the zero-dependency path: SQLite +
`AI_PROVIDER=mock` (deterministic, offline) + no Redis (background jobs run inline).
For real async processing / real LLM evaluation, edit `.env` and run a Celery worker —
see `backend/README.md`.

### 2 — Frontend  (this folder)

```bash
npm install            # already done once
npm run dev            # http://localhost:5173
```

`.env` here points the app at `http://localhost:8000/api/v1` (`VITE_API_BASE_URL`).

Open **http://localhost:5173** and sign in.

### Fresh backend Python setup (other machines)

Needs Python **3.12** (not 3.13/3.14). Then:
`python3.12 -m venv .venv && .venv/bin/pip install -r requirements.txt` → migrations → seed.

---

## Demo accounts (seeded — password `demo1234`)

| Role      | Email                  |
|-----------|------------------------|
| Admin     | admin@example.com      |
| Evaluator | evaluator@example.com  (Prof. Sameer Rao) |
| Student   | student@example.com    (Rahul Patel) |

Also seeded: 3 evaluators, 8 students, 2 subjects with processed syllabi, and one project.

---

## The end-to-end demo flow

1. **Admin** → *Question Generator* → pick DBMS → **Generate Scenario Question** (AI job,
   watch the stages) → **Publish**. Publishing generates a **unique scenario per student**
   (see *Question Distribution* — one common question, 8 different business domains).
2. **Student** (`student@example.com`) → *My Assessments* → **Open** → read the common
   question + *your* personalized scenario → drag-drop a `.zip` (any zip works — the
   backend extracts and validates it) → **Submit Solution**.
3. **Evaluator** (`evaluator@example.com`) → *Student Submissions* → open the row →
   **Run AI Evaluation** (11-stage pipeline: extract → file analysis → SQL syntax →
   test cases in an isolated SQLite sandbox → logic → rubric → AI-content probability →
   scoring → report). Inspect the expandable test cases and the AI-content indicator →
   **Evaluate manually** (rubric total is computed server-side) → **Submit Evaluation**
   (stays private) → **Publish AI Result to Student**.
4. **Student** → *Results* → published AI score, rubric breakdown, test cases,
   recommendations and the *estimated AI-generated content probability* (with its
   "not definitive proof" disclaimer). The evaluator's private marks/comments are
   **never** returned.
5. **Project workflow** (separate): Student → *Project Evaluation* → upload `project.zip`
   → Submit → Evaluator → *Project Evaluations* → Run AI Evaluation → Publish → Student
   sees the project result under *Results*.

---

## How the frontend connects to the backend

| Frontend piece | Backend |
|---|---|
| `src/api/http.ts` | fetch wrapper: attaches `Authorization: Bearer`, auto-refreshes on 401 (rotating refresh tokens), maps `{error:{code,message}}` |
| `src/api/endpoints.ts` | one typed function per `/api/v1/*` route |
| `src/api/adapt.ts` | maps backend DTOs (snake_case, split entities) → the frontend view models |
| `src/store/bootstrap.ts` | on login, loads the role's whole workspace into the store; re-runs after mutations |
| `src/services/*` | call `endpoints`, adapt, update the store, poll `/jobs/{id}` for async work |

`AI_PROVIDER=mock` makes the pipeline deterministic and instant. Set
`AI_PROVIDER=anthropic` + `ANTHROPIC_API_KEY` in `backend/.env` for real LLM
question generation, scenario generation and evaluation — the frontend is unchanged.

---

## End-to-end tests (headless Chrome, drives the real UI + backend)

With both servers running:

```bash
node scripts/smoke.mjs           # loads every page for all 3 roles, asserts no JS errors
node scripts/flow.mjs            # full Admin → Student → Evaluator → Publish → Result flow
node scripts/flow-project.mjs    # the project workflow
```

Backend unit/integration suite: `cd backend && .venv\Scripts\python.exe -m pytest` (31 tests).

---

## Tech

React 18 · React Router 6 · Tailwind 3 · lucide-react · `useSyncExternalStore` store ·
FastAPI · SQLAlchemy 2 · Alembic · Argon2 · PyJWT · Celery/Redis (optional) · PyMuPDF/python-docx.
