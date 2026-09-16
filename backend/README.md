# EvalAI — Backend

**Intelligent Assessment & Project Evaluation Platform** — FastAPI backend.

Real database, real JWT auth (Argon2 + refresh-token rotation), RBAC on every
endpoint, secure ZIP handling, isolated SQL test execution, a pluggable AI
provider (Anthropic / OpenAI / deterministic Mock), Celery background workers
with an inline fallback, and a pytest suite covering the full workflow.

```
FastAPI ──► services ──► PostgreSQL
   │                       ▲
   ├─ Celery + Redis ──────┘  (async: syllabus parse, question gen, AI evaluation)
   ├─ File storage (local / S3)
   └─ AI provider (anthropic | openai | mock)
```

---

## 1. Requirements

| Component  | Version | Notes |
|------------|---------|-------|
| Python     | **3.12** (3.11–3.13 OK) | 3.14 has no `pydantic-core` wheels yet |
| PostgreSQL | 14+     | production DB. sqlite is supported for quickstart/tests |
| Redis      | 7+      | Celery broker. Optional — without it, tasks run inline |

---

## 2. Local development (no Docker)

```bash
cd backend

# 1. virtualenv
python3.12 -m venv .venv
source .venv/bin/activate            # Windows: .venv\Scripts\activate

# 2. dependencies
pip install -r requirements.txt

# 3. configuration
cp .env.example .env
#   For a zero-dependency first run, set in .env:
#     DATABASE_URL=sqlite:///./evalai.db
#     REDIS_URL=                       # empty -> tasks run inline
#     AI_PROVIDER=mock                 # deterministic, no API key needed

# 4. start PostgreSQL + Redis (skip if using sqlite / inline)
#    e.g.  docker run -p 5432:5432 -e POSTGRES_USER=evalai -e POSTGRES_PASSWORD=evalai -e POSTGRES_DB=evalai postgres:16
#          docker run -p 6379:6379 redis:7

# 5. run migrations
alembic upgrade head

# 6. create the first admin  (password from FIRST_ADMIN_PASSWORD or prompted)
python -m scripts.create_admin

# 7. (optional) local demo data: 1 admin, 3 evaluators, 8 students, 2 subjects
python -m scripts.seed          # accounts: admin@example.com / evaluator@example.com / student@example.com  (demo1234)

# 8. run the API
uvicorn app.main:app --reload

# 9. run the Celery worker (only if REDIS_URL is set; otherwise tasks run inline)
celery -A app.workers.celery_app worker --loglevel=info
```

API docs: **http://localhost:8000/docs** · ReDoc: **/redoc** · OpenAPI JSON: **/openapi.json**

### Inline vs. async task execution
If `REDIS_URL` is empty (or `CELERY_TASK_ALWAYS_EAGER=true`), long-running work
(syllabus parsing, question generation, AI evaluation) runs **synchronously inside
the request** and still records a `Job` row you can poll. Set `REDIS_URL` and run a
worker to get true async processing — the API contract is identical (`202 Accepted`
+ `job_id`, poll `GET /api/v1/jobs/{job_id}`).

---

## 3. Docker (full stack)

```bash
cd backend
cp .env.example .env          # set JWT_SECRET_KEY, AI_PROVIDER, keys…
docker compose up --build
```

Services: `postgres`, `redis`, `api` (runs `alembic upgrade head` then uvicorn),
`worker` (Celery). API on `http://localhost:8000`.

Create the first admin inside the container:
```bash
docker compose exec api python -m scripts.create_admin
```

---

## 4. Database migrations (Alembic)

```bash
alembic upgrade head                          # apply
alembic revision --autogenerate -m "message"  # new migration from model changes
alembic downgrade -1                           # roll back one
```

The initial migration (`0001_initial`) materialises the whole schema from the
SQLAlchemy models. Model definitions in `app/models/` are the single source of truth.

---

## 5. Tests

```bash
pytest                       # 29 tests, uses in-memory sqlite + MockProvider, no services needed
pytest --cov=app             # with coverage
pytest app/tests/test_privacy.py -v
```

Covered: auth (login, refresh rotation, reuse detection, logout), RBAC boundaries,
subject limit (max 3), syllabus upload + extraction, **ZIP security** (path traversal,
absolute paths, blocked extensions, file-count cap, zip-bomb ratio, non-zip), the
**full Admin → Student → Evaluator → AI eval → manual eval → publish → student result**
workflow, idempotent evaluation start, server-side score validation, and **privacy**
(student result never contains evaluator private marks/comments; students can't read
another student's scenario; evaluators can't touch unassigned submissions).

---

## 6. Configuration reference (`.env`)

| Key | Purpose |
|---|---|
| `DATABASE_URL` | `postgresql+psycopg2://…` (prod) or `sqlite:///./evalai.db` |
| `REDIS_URL` | Celery broker; empty ⇒ inline tasks |
| `JWT_SECRET_KEY` | HS256 signing key — **set a long random value** |
| `JWT_ACCESS_TOKEN_EXPIRE_MINUTES` / `JWT_REFRESH_TOKEN_EXPIRE_DAYS` | token lifetimes |
| `AI_PROVIDER` | `mock` \| `anthropic` \| `openai` |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` | required when the matching provider is selected |
| `STORAGE_BACKEND` | `local` (→ `STORAGE_PATH`) or `s3` (→ `S3_*`) |
| `MAX_UPLOAD_SIZE`, `MAX_ZIP_FILES`, `MAX_UNCOMPRESSED_SIZE`, `MAX_ZIP_RATIO`, `MAX_ZIP_DEPTH` | ZIP guards |
| `SQL_SANDBOX_TIMEOUT_SECONDS` | isolated SQL execution timeout |
| `MAX_ACTIVE_SUBJECTS` | business rule, default 3 |
| `CORS_ORIGINS` | comma-separated allowed frontend origins |

Secrets are **never** logged and never exposed through the API. AI prompts and
API keys live only on the backend.

---

## 7. Architecture

```
app/
├── main.py                 FastAPI app, middleware, exception handlers
├── core/                   config, database, security (Argon2+JWT), storage,
│                           RBAC deps, error envelope, pagination, logging
├── models/                 SQLAlchemy 2.0 models (UUID PKs, FKs, constraints, timestamps)
├── schemas/                Pydantic v2 request/response models
├── ai/
│   ├── provider.py         AIProvider ABC + Anthropic / OpenAI / Mock, JSON-schema
│   │                       validation with retry (never trusts raw LLM output)
│   ├── prompts.py          versioned server-side prompts
│   ├── schemas.py          structured-output models (score range validators)
│   ├── question_generator / scenario_generator / answer_evaluator /
│   │   project_evaluator / ai_content_detector
│   └── mock.py             deterministic offline builders (tests only)
├── services/               business logic + transactions
│   ├── zip_service.py      secure extraction (traversal, bombs, symlinks, nesting)
│   ├── sql_sandbox.py      isolated in-memory SQLite exec (authorizer + timeout)
│   ├── code_analysis_service.py   deterministic test cases (ground truth)
│   ├── ai_evaluation_service.py   hybrid pipeline (deterministic + AI), stages,
│   │                              scoring with server-side validation, publish
│   ├── manual_evaluation_service.py  private evaluator grading (range-checked)
│   ├── result_service.py   student-safe result assembly (strips private data)
│   └── syllabus / assessment / scenario / submission / project(_evaluation)
├── workers/                Celery app, task defs, runners, inline dispatch, Job tracking
└── api/                    routers: auth, admin, student, evaluator, notifications, jobs, health
```

### Evaluation pipeline stages
`QUEUED → EXTRACTING → FILE_ANALYSIS → SYNTAX_CHECK → TEST_CASES → LOGIC_ANALYSIS →
RUBRIC_ANALYSIS → AI_CONTENT_ANALYSIS → SCORING → REPORT_GENERATION → COMPLETED`
(then `PUBLISHED` when the evaluator releases it). Progress + `stage_history` are
stored on the `ai_evaluations` row and returned by `GET /evaluator/ai-evaluations/{id}`.

### Hybrid evaluation
Deterministic checks (file structure, SQL executes, schema/PK/FK, JOIN/aggregate
presence & execution, normalization heuristics) are computed in the isolated SQLite
sandbox and stored as `ai_test_cases` — they are the **ground truth** handed to the
LLM. The AI scores only the stored rubric criteria, with evidence; totals are
clamped server-side to the rubric maximum.

### AI-generated-content indicator
Always stored & returned as `estimated_probability` (0–1) + `classification`
(LOW/MODERATE/HIGH) + `evidence` + a disclaimer string. Never presented as proof.

---

## 8. Key business rules (enforced server-side)

1. ≤ 3 active subjects (`409 SUBJECT_LIMIT_REACHED`).
2. One assessment → exactly one multi-part question + one rubric (sums to ~100).
3. Common question is shared; every assigned student gets a **stored, unique**
   scenario (`student_scenarios`, hashed, generated once at publish time).
4. A student can only read **their own** scenario (`403 SCENARIO_FORBIDDEN`).
5. Only `.zip`, validated (extension + magic bytes + traversal + bomb + nesting).
6. Submitted submissions are locked (no resubmission unless the assessment allows it).
7. Evaluators only see submissions for assessments they're assigned to.
8. AI evaluation is asynchronous and **idempotent** — re-calling returns the
   running/completed evaluation unless `?force_new_version=true` (keeps history).
9. Manual evaluator marks/comments are **private** and never returned by any
   student endpoint.
10. The AI result is visible to the student **only after** the evaluator publishes it
    (`403 RESULT_NOT_PUBLISHED` before that).
11. Publishing is transactional: validate → flip status → audit log → notification.
12. Student code/SQL never runs against the app database — only the isolated sandbox.

---

## 9. API surface (`/api/v1`)

**Auth** `POST /auth/register` · `POST /auth/login` · `POST /auth/refresh` ·
`POST /auth/logout` · `GET /auth/me`

**Admin** `GET /admin/dashboard` · `GET /admin/analytics/{overview,submissions,scores}` ·
`GET|POST /admin/subjects` · `GET|PUT|DELETE /admin/subjects/{id}` ·
`POST|GET /admin/subjects/{id}/syllabus` ·
`POST /admin/assessments/generate` · `GET /admin/assessments` · `GET|PUT /admin/assessments/{id}` ·
`POST /admin/assessments/{id}/assign` · `POST /admin/assessments/{id}/publish` · `POST /admin/assignments` ·
`GET /admin/students` · `GET /admin/evaluators` · `GET|POST /admin/projects`

**Student** `GET /student/dashboard` · `GET /student/assessments` · `GET /student/assessments/{id}` ·
`GET /student/assessments/{id}/scenario` · `POST /student/assessments/{id}/submissions` ·
`POST /student/submissions/{id}/submit` · `GET /student/submissions` · `GET /student/submissions/{id}` ·
`GET /student/submissions/{id}/result` · `GET /student/projects` · `GET /student/projects/{id}` ·
`POST /student/projects/{id}/submissions` · `POST /student/project-submissions/{id}/submit` ·
`GET /student/projects/{id}/submissions` · `GET /student/project-submissions/{id}/result`

**Evaluator** `GET /evaluator/dashboard` · `GET /evaluator/analytics` ·
`GET /evaluator/submissions` (search / filter / sort / paginate) · `GET /evaluator/submissions/{id}` ·
`GET /evaluator/submissions/{id}/test-cases` ·
`POST /evaluator/submissions/{id}/ai-evaluate` · `GET /evaluator/ai-evaluations/{id}` ·
`POST /evaluator/ai-evaluations/{id}/publish` ·
`POST /evaluator/submissions/{id}/manual-evaluation` · `PUT|GET /evaluator/manual-evaluations/{id}` ·
`GET /evaluator/projects/submissions` · `GET /evaluator/projects/submissions/{id}` ·
`POST /evaluator/projects/submissions/{id}/ai-evaluate` ·
`GET /evaluator/projects/evaluations/{id}` · `POST /evaluator/projects/evaluations/{id}/publish`

**Notifications** `GET /notifications` · `POST /notifications/{id}/read` · `POST /notifications/read-all`

**Jobs** `GET /jobs/{job_id}`  **Health** `GET /health` · `/health/db` · `/health/redis`

### Error envelope
```json
{ "error": { "code": "SUBMISSION_NOT_FOUND", "message": "Submission does not exist." } }
```
Status codes: 400 / 401 / 403 / 404 / 409 / 413 / 422 / 500. Stack traces are never returned.

---

## 10. Connecting the frontend

1. **Base URL**: `http://<host>:8000` + prefix `/api/v1`. Add your origin to `CORS_ORIGINS`.
2. **Login** → store `access_token` (memory) + `refresh_token`. Send
   `Authorization: Bearer <access_token>` on every call. The user's role comes from
   `user.role` in the login response (the backend re-derives it from the DB on every
   request — a forged role claim is ignored).
3. **On 401 `TOKEN_EXPIRED`** → `POST /auth/refresh` with the refresh token, swap in
   the new pair (refresh tokens rotate; the old one is single-use). On
   `REFRESH_REUSED` / `REFRESH_EXPIRED` → force re-login.
4. **Async operations** return `202` + `{ evaluation_id, job_id, status }` (or a
   `JobOut`). Poll `GET /jobs/{job_id}` for `status`/`progress`/`stage`, or poll the
   resource itself (`GET /evaluator/ai-evaluations/{id}` exposes `stage`,
   `progress`, `stage_history`) to animate the pipeline.
5. **Uploads**: `multipart/form-data`, field name `file`, `.zip` only. The response
   includes the extracted `files[]` inventory. Then `POST …/submit` to lock it.
6. **Role screens map 1:1** to the router prefixes: admin UI → `/admin/*`,
   evaluator UI → `/evaluator/*`, student UI → `/student/*`. A wrong-role call
   returns `403 ROLE_FORBIDDEN`, so the frontend can also gate navigation on
   `user.role`.
7. **Student results**: `GET /student/submissions/{id}/result` returns `403
   RESULT_NOT_PUBLISHED` until the evaluator publishes; after that it returns the AI
   score, rubric breakdown, test cases, strengths/issues/recommendations and the
   AI-content indicator — and *never* evaluator private data.

---

## 11. Production notes

- Set a strong `JWT_SECRET_KEY`, `AI_PROVIDER=anthropic|openai` with a real key,
  `STORAGE_BACKEND=s3`, `DATABASE_URL` to managed Postgres, `REDIS_URL` to managed Redis.
- Run `alembic upgrade head` on deploy; run the API behind TLS; run ≥1 Celery worker.
- The SQL sandbox uses in-process SQLite with an authorizer + timeout. For
  untrusted code execution at scale, run workers in locked-down containers
  (no network, CPU/mem/pids limits, read-only FS) — the `ExecutionEngine`
  boundary in `sql_sandbox.py` / `code_analysis_service.py` is where a
  container-per-run executor plugs in.
- Rotate refresh tokens are stored hashed; revoked families on reuse detection.
- Add a rate limiter (e.g. slowapi / gateway) in front of `/auth/*` in production.
```
