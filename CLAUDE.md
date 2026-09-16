# EvalAI — Intelligent Assessment & Project Evaluation Platform

Full-stack, AI-powered academic assessment system. An admin uploads a syllabus,
the system extracts the subject/topics, generates one common scenario-based
question, and publishes it to every student. Each student gets the **same
question** but a **unique, personalized scenario** (different domain/data),
uploads a `.zip` solution, and an evaluator runs a hybrid deterministic+AI
evaluation pipeline before publishing the result back to the student. A
parallel, simpler **project evaluation** workflow exists alongside it.

This file is the orientation doc for working in this repo. `README.md` and
`backend/README.md` have more narrative detail; this file is the source of
truth for **current** behavior — keep it updated when you change something
described here.

---

## 1. Tech stack

**Frontend** (repo root)
- React 18 + TypeScript + Vite 5 + Tailwind 3 + `react-router-dom` 6 + `lucide-react`
- No Redux/Zustand — a hand-rolled store on `useSyncExternalStore` (`src/store/store.ts`)
- Vite dev proxy: `/api` → `http://127.0.0.1:8000` (see `vite.config.ts`)

**Backend** (`backend/`)
- Python **3.12** (not 3.13/3.14 — `pydantic-core` wheels weren't available when this
  was set up; the venv at `backend/.venv` is already built for 3.12, don't recreate
  it with a different interpreter)
- FastAPI 0.115 + Pydantic v2 + SQLAlchemy 2.0 (sync) + Alembic + Argon2 (`argon2-cffi`)
  + PyJWT (rotating refresh tokens) + Celery 5 (optional — see §5)
- SQLite for dev (`backend/evalai.db`), Postgres for production (`psycopg2-binary`)
- PyMuPDF / python-docx / openpyxl for syllabus and roster document parsing
- pytest 8, 32 tests, in-memory SQLite + a deterministic Mock AI provider — no
  network calls in the suite

---

## 2. Repo layout

```
Evaluation system/
├── CLAUDE.md                 you are here
├── README.md                 frontend-facing run instructions (may lag — this file wins)
├── Lj student data.xlsx      the real student roster (enrollment no. + name), "Marks" sheet
├── src/                      frontend
│   ├── api/                  http.ts (fetch wrapper + token refresh), endpoints.ts
│   │                         (one fn per route), dto.ts (backend snake_case shapes),
│   │                         adapt.ts (DTO -> frontend camelCase view models)
│   ├── store/                store.ts (useSyncExternalStore), bootstrap.ts (loads a
│   │                         role's whole workspace on login), refs.ts
│   ├── services/             thin per-domain wrappers: call endpoints, adapt, update
│   │                         the store, poll /jobs/{id} for async work
│   ├── pages/{admin,evaluator,student,auth}/   one file per route
│   ├── components/           shared UI (primitives.tsx = Button/Card/Badge/Modal/…),
│   │                         evaluation/ (AI report, file viewer, publish modal),
│   │                         student/AssessmentPanel.tsx (the single question screen)
│   └── types/index.ts        frontend domain types
└── backend/
    ├── app/
    │   ├── main.py            FastAPI app; on startup (sqlite) logs the DB path +
    │   │                      row counts so "did my data disappear" is obvious
    │   ├── core/               config.py (Settings — see §4), database.py, security.py
    │   │                      (Argon2 + JWT), deps.py (RBAC), errors.py (error envelope)
    │   ├── models/             SQLAlchemy 2.0 models — UUID PKs, plain `String` status/
    │   │                      difficulty columns (no DB enum), TimestampMixin
    │   ├── schemas/            Pydantic v2 request/response models
    │   ├── ai/                 provider.py (AIProvider ABC + Anthropic/OpenAI/Groq/Mock),
    │   │                      prompts.py, schemas.py (structured-output models),
    │   │                      question_generator / scenario_generator / answer_evaluator /
    │   │                      project_evaluator / syllabus_analyzer / ai_content_detector
    │   ├── services/           business logic + transactions (see §7 for the domain model)
    │   ├── workers/            Celery app + task defs + an inline/eager fallback so
    │   │                      the whole system works with zero Redis (see §5)
    │   ├── api/                routers: auth, admin, student, evaluator, notifications,
    │   │                      jobs, health — `_serializers.py` builds the *Out schemas
    │   └── tests/               32 pytest tests
    ├── alembic/versions/       0001_initial, 0002_subject_semester, 0003_assessment_timer
    ├── scripts/                seed.py, import_students.py, backup_db.py, create_admin.py
    ├── fixtures/                demo_solution.zip / demo_project.zip for manual testing
    └── .env                    see §4 — gitignored, has the live Groq key
```

---

## 3. How to run (2 terminals)

```powershell
# Terminal 1 — backend
cd backend
.venv\Scripts\Activate.ps1
python -m alembic upgrade head        # first time / after a schema change
python -m scripts.seed                # idempotent: ensures 1 admin + 3 evaluators exist
python -m scripts.import_students     # idempotent: syncs the roster, never deletes
python -m uvicorn app.main:app --port 8000 --host 127.0.0.1 --reload

# Terminal 2 — frontend
cd "Evaluation system"
npm install
npx vite
```

Open `http://localhost:5173`. Login: admin/evaluator use email
(`admin@example.com` / `evaluator@example.com`, password `demo1234`); students
log in with their **enrollment number**, password = **last 7 digits of the
enrollment number** (e.g. `25004406110001` / `6110001`).

### Windows gotcha — stale uvicorn after a route change
`--reload` does not always pick up newly-added route decorators, and killed
processes sometimes leave a zombie holding the port. If a call 404/405s that
you just added, **fully kill and restart**, don't trust `--reload`:
```powershell
Get-Process python -EA SilentlyContinue | Stop-Process -Force
```
then start uvicorn again. Verify with `GET /openapi.json` that the route exists
if in doubt.

### Data persistence
`backend/.env`'s `DATABASE_URL`/`STORAGE_PATH` and the `.env` file lookup itself
are all **anchored to an absolute path under `backend/`** (`app/core/config.py`,
`BACKEND_ROOT`) — this was a real bug once: a relative `sqlite:///./evalai.db`
resolves against the *process* working directory, so launching uvicorn from a
different folder silently created a fresh empty DB. Don't reintroduce a
relative path here. `scripts/seed.py` and `scripts/import_students.py` are both
**idempotent / additive only** — they never delete existing accounts or data;
`import_students.py` used to `DELETE FROM users WHERE role='STUDENT'` on every
run (wiping submissions via cascade) — that was a real bug, fixed to sync
instead of nuke. Back up with `python -m scripts.backup_db`.

---

## 4. Configuration (`backend/.env`)

```
DATABASE_URL=sqlite:///./evalai.db      # anchored to backend/ regardless of CWD
AI_PROVIDER=groq                        # mock | anthropic | openai | groq
GROQ_API_KEY=...
GROQ_MODEL=openai/gpt-oss-20b           # question / scenario / syllabus generation
GROQ_EVAL_MODEL=openai/gpt-oss-120b     # answer & project evaluation — deliberately a
                                         # DIFFERENT model so it has its own separate
                                         # rate-limit bucket from generation traffic
JWT_SECRET_KEY=...
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
FIRST_ADMIN_PASSWORD=admin12345
```

`AI_PROVIDER=mock` (the default if unset) makes the whole pipeline
deterministic/offline — used by the pytest suite. Groq is the real provider in
use for this project; Anthropic/OpenAI providers exist in `app/ai/provider.py`
and work the same way if you set those keys instead.

Other tunables worth knowing (`app/core/config.py`):
`MAX_ACTIVE_SUBJECTS=50`, `AI_RATE_LIMIT_MAX_WAIT_S=20` (a `Retry-After` longer
than this is treated as a daily-quota exhaustion and fails fast instead of
sleeping), `EAGER_SCENARIO_GENERATION=false` (scenarios self-heal lazily per
student on first open, instead of one LLM call per student at publish time —
much better for a 56-student class on a free API tier).

---

## 5. Background jobs without Redis

No Redis is configured. `settings.celery_eager` is true whenever `REDIS_URL`
is empty, so `app/workers/dispatch.py` runs jobs **inline** (or, for slow
per-student work like scenario generation, on a **daemon thread**) instead of
enqueuing to Celery — a `Job` row is still created and pollable at
`GET /jobs/{id}` either way. The Celery code path is real and works if you set
`REDIS_URL` and run a worker; it's just not needed for this deployment.

---

## 6. Auth & roles

Three roles: `admin`, `evaluator`, `student`. JWT access token (30 min) +
rotating single-use refresh token (14 days). `POST /auth/login` takes
`{identifier, password}` — `identifier` is matched against **either** email
(admin/evaluator) **or** `student_id`/enrollment number (students), see
`app/api/auth.py`. The role in the JWT is never trusted for authorization —
every request re-reads the user's role from the DB (`app/core/deps.py`).

Student roster: **only** the 56 students in `Lj student data.xlsx` (sheet
`Marks`) can log in — no dummy/seeded students. Re-import with
`python -m scripts.import_students [path/to/file.xlsx]` any time the roster
changes; it's a sync (add/update), never a wipe.

---

## 7. Domain model / how a question flows through the system

```
Subject ──1:1── Syllabus ──1:N── SyllabusTopic
   │
   └──1:N── Assessment ──1:1── Question ──1:N── QuestionPart
                 │                    └──1:N── RubricCriterion (max_marks sum to 100)
                 ├──1:N── AssessmentStudent  (link + per-student started_at for the timer)
                 ├──1:N── AssessmentEvaluator
                 ├──1:N── StudentScenario    (one unique scenario per student)
                 └──1:N── Submission ──1:N── SubmissionFile
                               ├──1:N── AIEvaluation ──1:N── AITestCase
                               └──1:1── ManualEvaluation (evaluator-private)
```

`Project` / `ProjectSubmission` / `ProjectEvaluation` mirror this for the
separate, simpler project-evaluation workflow (no scenario concept there).

**Key invariant:** the *common question* (`Question.common_prompt`, parts,
rubric) is identical for every student on an assessment. What differs per
student is only the `StudentScenario` (different business domain, entity/table
names, sample data) — same learning objectives and rubric, so grading stays
comparable across students while discouraging answer-sharing.

---

## 8. The admin workflow — one screen (`/admin`, `WorkspacePage.tsx`)

Everything an admin needs is on one page, top to bottom:

1. **Add syllabus** (PDF/DOCX/TXT) → `POST /admin/workspace/syllabus` → the AI
   (or a regex/heuristic fallback if the AI call fails) extracts **subject
   name, code, semester, description, difficulty, topics, learning
   outcomes** and creates/updates the `Subject` + `Syllabus` in one call.
   Name/code/semester are editable before generating.
2. **Difficulty** — Easy / Medium / Hard / **Advanced**. Advanced isn't just a
   label: `question_generator.py` has per-tier prompt guidance, and Advanced
   explicitly asks for a "twisted" question — multiple concepts combined
   non-obviously, real edge cases, at least one part that can't be solved by
   pattern-matching a textbook example. The requested difficulty is force-set
   server-side after generation (`assessment.difficulty = difficulty.upper()`)
   so it can never silently drift from what the model echoed back.
   **Difficulty is shown only to admin** — never to students or evaluators.
3. **Class coverage (optional)** — free text of what was *actually taught* in
   class. When given, generation is scoped **strictly** to that text instead
   of the full syllabus (which may include topics not yet covered) — this
   exists because "generate from the whole syllabus" was producing questions
   students hadn't been taught the material for.
4. **Generate** → `POST /admin/assessments/generate` (async job, polled).
5. **Publish** → `POST /admin/assessments/{id}/publish`. This auto-assigns
   **every** student and evaluator (no manual assignment step) and accepts an
   optional **time limit in minutes** (`PublishAssessmentRequest.duration_minutes`,
   §9). Leaving it blank = no timer, exactly like before the feature existed.
6. **Student papers** — shows each student's generated scenario as it
   appears (lazy self-heal) or a "build all now" button to eagerly generate
   the whole batch (one LLM call per student — slow for a big class on a
   free API tier, hence lazy-by-default).

The old multi-page flow (Subjects & Syllabus / Question Generator / Question
Distribution) was removed from the admin nav in favor of this one screen;
`QuestionGeneratorPage.tsx`/`SubjectsPage.tsx`/`DistributionPage.tsx` still
exist on disk but aren't routed.

---

## 9. Per-question timer (optional, set at publish)

- Admin enters a duration (minutes) on the publish step. Blank = no timer,
  behavior unchanged.
- The clock is **per-student**, starting the moment *that student* opens the
  question (`POST /student/assessments/{id}/start`, idempotent — calling it
  again never resets an already-running clock), not at publish time and not
  shared across students. Backed by `AssessmentStudent.started_at`.
- Frontend (`AssessmentPanel.tsx`) shows a live "Time remaining" countdown.
  If the student **submits early**, the countdown stops and disappears
  immediately (it does not keep ticking toward a moot deadline).
  If time runs out first, whatever's uploaded-but-not-yet-submitted is
  **auto-submitted**; if nothing was uploaded, the upload area just locks.
- Server-side backstop: new **uploads** are rejected after expiry
  (`400 TIME_EXPIRED`, checked in `submission_service.create_submission` via
  `assessment_service.time_status`) — submit itself is never blocked, so a
  slightly-late auto-submit call still lands.
- **SQLite datetime gotcha**: `DateTime(timezone=True)` columns still round-trip
  as timezone-**naive** on SQLite. `assessment_service._aware()` re-attaches
  UTC before any comparison/arithmetic — forgetting this raises
  `can't compare offset-naive and offset-aware datetimes`. Follow the same
  pattern (`app/api/auth.py`'s refresh-token expiry check) anywhere else you
  compare a DB-sourced datetime against `datetime.now(UTC)`.

---

## 10. Student experience — minimum clicks

- **Dashboard** (`StudentDashboard.tsx`) shows one card per published
  assessment (subject name, deadline, status) — no question content yet.
- Clicking a card opens the question screen (`/student/assessments/:id`,
  `AssessmentPanel.tsx` — shared by that route and could be reused elsewhere):
  common question + personal scenario + parts/instructions/constraints +
  required-files list + the countdown (if any) + the ZIP dropzone + submit,
  **all on one screen** — no switching pages to submit.
- **Copy protection** (`NoCopy.tsx`): the question/scenario/parts text blocks
  user-select, copy/cut, right-click and drag. Best-effort deterrent only —
  cannot and does not claim to stop screenshots, OCR, or a phone photo (see
  the "what doesn't work" note below).
- **Hidden anti-AI text** (`AntiAIGuard.tsx`): an off-screen, `aria-hidden`
  (so screen readers skip it) instruction embedded after each question/
  scenario/part block, present in `innerText`/`textContent` but invisible on
  screen — aimed at browser extensions/"answer this for me" tools that scrape
  the rendered page and feed it to an LLM.
- **No difficulty label** is ever shown to students (see §8).
- **Privacy**: a student's result endpoint never includes evaluator private
  marks/comments, and a scenario is only ever returned to its own student
  (`scenario_service.assert_owns_scenario`).

### What was considered and explicitly NOT built (ask before redoing)
- A full "AI assistance is strictly prohibited" visible warning banner — added,
  then removed on request.
- A per-student visible watermark on the question (name/enrollment/timestamp
  tiled across the screen, for traceability if a screenshot leaks) — built,
  verified working, then **reverted** on request. If asked again, the
  approach is documented in this conversation's history; it's not currently
  in the codebase.
- **Screenshot/Win+PrtScn blocking is categorically impossible from a web
  page** — it's an OS-level shell hotkey, not something JS can see or cancel.
  Don't attempt it; explain the limits instead (lockdown/proctoring software
  is the only real answer, and it's outside this app).

---

## 11. Evaluator workflow — also minimum clicks

- **Run AI Evaluation**: clicking the button opens the modal *and starts the
  evaluation immediately* — no second "confirm" click inside the modal
  (`AIEvaluationModal.tsx`, `ProjectEvaluationsPage.tsx`'s project modal).
- Evaluation pipeline is a **single LLM call** now (rubric scoring + AI-content
  probability were originally two separate calls; merged into one — see
  `AnswerEvalResult`/`ProjectEvalResult`'s `ai_content_*` fields) — this was a
  direct fix for "evaluation takes too long" (was minutes/failing under Groq
  rate limits; now ~1–8s per evaluation).
- **File viewer**: clicking any filename in "Archive contents" opens a popup
  with that file's content (`FileViewerModal.tsx`,
  `GET /evaluator/submissions/{id}/file?path=...`) — text files render
  inline (including extension-less ones like `Makefile`, via a clean-UTF‑8
  heuristic), binaries show a "can't display" message.
- **Publish AI Result to Student**: publishes directly on click, no
  confirmation popup (was a `PublishModal` before; removed from this one
  button only — `PublishModal.tsx` still exists and is still used by the
  Manual Evaluation page).
- **Admin can delete a question** (`QuestionsPage.tsx` → `DELETE
  /admin/assessments/{id}`) — cascades parts/rubric/scenarios/submissions/
  evaluations. If this 404s/405s, you're hitting a stale backend process —
  see the Windows gotcha in §3.

---

## 12. AI provider abstraction (`app/ai/provider.py`)

`AIProvider` ABC → `AnthropicProvider`, `_OpenAICompatibleProvider` base →
`OpenAIProvider` + `GroqProvider`, `MockProvider`. `complete_json(system, user,
schema)` extracts JSON from the response, retries on invalid output, and
validates with the Pydantic schema — **raw LLM output is never trusted
directly**. `get_eval_provider()` returns a second Groq client pointed at
`GROQ_EVAL_MODEL` so evaluation traffic doesn't compete with
generation/scenario traffic for the same per-minute token bucket.

Rate-limit handling (`_with_rate_limit_retry`): short (per-minute) 429s are
retried with backoff; a `Retry-After` longer than `AI_RATE_LIMIT_MAX_WAIT_S`
(or an explicit `x-should-retry: false`) is treated as a **daily quota
exhaustion** and raises `QuotaExhausted` immediately instead of sleeping for
minutes — this was a real production issue (a burnt-out `gpt-oss-120b` daily
quota made evaluations hang for minutes before failing).

`gpt-oss` models (via Groq) spend part of `max_tokens` on internal reasoning
before the visible JSON — prompts here were tuned with that headroom in mind;
if you see `json_validate_failed` from Groq, `_raw_complete` already retries
once without `response_format` before giving up.

---

## 13. Testing

```bash
cd backend
.venv\Scripts\python.exe -m pytest -q      # 32 tests, in-memory sqlite + Mock provider
```

No committed browser/e2e test suite. Throughout development, one-off Puppeteer
scripts (using `puppeteer-core` + the system Chrome, already a devDependency)
were written to the OS scratch dir, driven against the real running backend +
`localhost:5173`, and discarded after — that's the pattern to reuse for manual
end-to-end verification, not a permanent fixture. `scripts/*.mjs` at the repo
root (`smoke.mjs`, `flow.mjs`, `flow-project.mjs`) are older, may reference
stale demo accounts — check before relying on them.

When testing generation/publish flows by hand, **clean up what you create**:
`DELETE /admin/assessments/{id}` cascades everything, and there's a
`scripts/backup_db.py` if you want a snapshot first. Never delete real student
accounts or their submissions.

---

## 14. Things to never reintroduce

- Relative `DATABASE_URL`/`STORAGE_PATH`/`.env` lookup (breaks the moment the
  process is launched from a different CWD — see §3).
- A destructive `import_students.py` that deletes-then-recreates students
  (cascades away real submissions).
- Calling `assessment_service.assign()` without expiring the assessment's
  `student_links`/`evaluator_links` relationship afterward if you mutate it via
  raw FK inserts rather than the ORM collection — SQLAlchemy's identity map
  will keep serving a stale (empty) cached collection to anyone already
  holding that `Assessment` instance in the same session. (`assign()` already
  handles this via `db.expire(...)` — don't remove it.)
- Naive-vs-aware datetime comparisons on anything read back from SQLite (§9).
