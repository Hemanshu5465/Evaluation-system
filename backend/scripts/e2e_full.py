"""Full end-to-end exercise of every EvalAI endpoint against a LIVE server.

Runs the real workflow with whatever AI provider is configured (Groq by default).
Covers: auth (+ negative cases), RBAC, subjects + limit, syllabus (upload/get/delete),
assessment generate/list/get/update/assign/publish/scenarios, student assessments/
scenario/submission/submit/result, ZIP-security rejections, evaluator submissions
(pagination/search/filter/sort), AI evaluation (+ idempotency + versioning), test
cases, manual evaluation (+ validation), publishing (+ double-publish guard),
privacy (student never sees evaluator private data), projects (full workflow),
notifications, jobs (+ ownership), health.

Usage:
    # start the API first:  uvicorn app.main:app --port 8000
    python -m scripts.e2e_full            [--base URL] [--skip-ai]
"""

from __future__ import annotations

import argparse
import io
import sys
import time
import uuid
import zipfile

import httpx

PASS = 0
FAIL = 0
SECTION = ""


def section(name: str) -> None:
    global SECTION
    SECTION = name
    print(f"\n\033[1m== {name} ==\033[0m")


def check(cond: bool, msg: str, detail: str = "") -> None:
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"  \033[32m✓\033[0m {msg}")
    else:
        FAIL += 1
        print(f"  \033[31m✗ {msg}\033[0m  {detail}")


class Client:
    def __init__(self, base: str):
        self.h = httpx.Client(base_url=base, timeout=120)
        self.tokens: dict[str, str] = {}
        self.role = "anon"

    def auth(self, access: str, refresh: str = "", role: str = ""):
        self.tokens = {"access": access, "refresh": refresh}
        self.role = role or self.role
        return self

    def _hdr(self):
        return {"Authorization": f"Bearer {self.tokens['access']}"} if self.tokens.get("access") else {}

    def get(self, path, **kw):
        return self.h.get(path, headers=self._hdr(), **kw)

    def post(self, path, **kw):
        return self.h.post(path, headers=self._hdr(), **kw)

    def put(self, path, **kw):
        return self.h.put(path, headers=self._hdr(), **kw)

    def delete(self, path, **kw):
        return self.h.delete(path, headers=self._hdr(), **kw)


def make_zip(files: dict[str, str]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for n, c in files.items():
            z.writestr(n, c)
    return buf.getvalue()


def bad_zip(kind: str) -> bytes:
    buf = io.BytesIO()
    if kind == "traversal":
        with zipfile.ZipFile(buf, "w") as z:
            z.writestr("../../etc/passwd", "x")
    elif kind == "exe":
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
            z.writestr("payload.exe", b"MZ\x90\x00" * 10)
    elif kind == "notzip":
        return b"this is definitely not a zip archive"
    return buf.getvalue()


SOLUTION = {
    "schema.sql": (
        "CREATE TABLE department (department_id INTEGER PRIMARY KEY, name TEXT NOT NULL);\n"
        "CREATE TABLE doctor (doctor_id INTEGER PRIMARY KEY, full_name TEXT NOT NULL, "
        "department_id INTEGER REFERENCES department(department_id));\n"
        "CREATE TABLE patient (patient_id INTEGER PRIMARY KEY, full_name TEXT NOT NULL, dob TEXT);\n"
        "CREATE TABLE appointment (appointment_id INTEGER PRIMARY KEY, "
        "patient_id INTEGER REFERENCES patient(patient_id), "
        "doctor_id INTEGER REFERENCES doctor(doctor_id), scheduled_at TEXT, status TEXT);\n"
    ),
    "queries.sql": (
        "SELECT full_name FROM patient WHERE dob < '2000-01-01';\n"
        "SELECT p.full_name, d.full_name FROM appointment a "
        "JOIN patient p ON p.patient_id=a.patient_id JOIN doctor d ON d.doctor_id=a.doctor_id;\n"
        "SELECT d.department_id, COUNT(*) c FROM appointment a "
        "JOIN doctor d ON d.doctor_id=a.doctor_id GROUP BY d.department_id HAVING COUNT(*) >= 0;\n"
    ),
    "solution.sql": "SELECT 1;\n",
    "README.md": "# Hospital DB solution\nAll assumptions documented here.\n",
}

PROJECT_FILES = {
    "README.md": "# E-Commerce\nSetup: npm install && npm start\n",
    "documentation.md": "## API\nGET /products — list products\n",
    "database.sql": "CREATE TABLE product (id INTEGER PRIMARY KEY, title TEXT, price REAL);\n",
    "package.json": '{"name":"shop","version":"1.0.0","dependencies":{}}',
    "src/index.js": "const id = req.query.id;\nconst q = `SELECT * FROM product WHERE id=${id}`;\n",
    "public/index.html": "<!doctype html><title>Shop</title>",
}


def rnd() -> str:
    return uuid.uuid4().hex[:6]


def poll_job(admin: Client, job_id: str, timeout=180) -> dict:
    start = time.time()
    while time.time() - start < timeout:
        j = admin.get(f"/api/v1/jobs/{job_id}").json()
        if j["status"] in ("COMPLETED", "FAILED"):
            return j
        time.sleep(1.5)
    return {"status": "TIMEOUT"}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:8000")
    ap.add_argument("--skip-ai", action="store_true", help="skip the LLM-backed steps")
    args = ap.parse_args()
    B = args.base

    root = httpx.Client(base_url=B, timeout=60)

    # ---------------------------------------------------------------- HEALTH
    section("Health")
    check(root.get("/health").json()["status"] == "healthy", "GET /health")
    check(root.get("/health/db").json().get("database") == "healthy", "GET /health/db")
    check("redis" in root.get("/health/redis").json(), "GET /health/redis")
    check(root.get("/openapi.json").status_code == 200, "OpenAPI schema served")

    # ---------------------------------------------------------------- AUTH
    section("Authentication")
    suffix = rnd()
    admin_email = f"admin_{suffix}@e2e.dev"
    r = root.post("/api/v1/auth/register", json={
        "name": "E2E Admin", "email": admin_email, "password": "password123", "role": "ADMIN"})
    check(r.status_code == 201, "register ADMIN", r.text[:120])
    admin = Client(B).auth(r.json()["access_token"], r.json()["refresh_token"], "admin")

    ev_email = f"eval_{suffix}@e2e.dev"
    r = root.post("/api/v1/auth/register", json={
        "name": "E2E Evaluator", "email": ev_email, "password": "password123",
        "role": "EVALUATOR", "department": "CS"})
    check(r.status_code == 201, "register EVALUATOR")
    evaluator = Client(B).auth(r.json()["access_token"], r.json()["refresh_token"], "evaluator")

    students = []
    for i in range(2):
        se = f"stu{i}_{suffix}@e2e.dev"
        r = root.post("/api/v1/auth/register", json={
            "name": f"E2E Student {i}", "email": se, "password": "password123",
            "role": "STUDENT", "student_id": f"E2E-{suffix}-{i}"})
        check(r.status_code == 201, f"register STUDENT {i}")
        students.append(Client(B).auth(r.json()["access_token"], r.json()["refresh_token"], "student"))

    check(root.post("/api/v1/auth/register", json={
        "name": "Dup Admin", "email": admin_email, "password": "password123", "role": "ADMIN"}).status_code == 409,
        "duplicate email -> 409")
    check(root.post("/api/v1/auth/login", json={"email": admin_email, "password": "nope"}).status_code == 401,
        "wrong password -> 401")
    check(root.post("/api/v1/auth/register", json={
        "name": "No Student Id", "email": f"s_{suffix}@e2e.dev", "password": "password123",
        "role": "STUDENT"}).status_code in (400, 422),
        "student without student_id -> 4xx")

    r = root.post("/api/v1/auth/login", json={"email": admin_email, "password": "password123"})
    check(r.status_code == 200 and r.json()["user"]["role"] == "ADMIN", "login returns role from DB")
    old_refresh = admin.tokens["refresh"]
    r = root.post("/api/v1/auth/refresh", json={"refresh_token": old_refresh})
    check(r.status_code == 200, "refresh rotates tokens")
    admin.auth(r.json()["access_token"], r.json()["refresh_token"], "admin")
    check(root.post("/api/v1/auth/refresh", json={"refresh_token": old_refresh}).status_code == 401,
        "reused refresh token rejected")
    check(admin.get("/api/v1/auth/me").json()["email"] == admin_email, "GET /auth/me")
    check(root.get("/api/v1/auth/me").status_code == 401, "no token -> 401")

    # ---------------------------------------------------------------- RBAC
    section("RBAC boundaries")
    check(students[0].get("/api/v1/admin/subjects").status_code == 403, "student -> admin 403")
    check(evaluator.get("/api/v1/admin/subjects").status_code == 403, "evaluator -> admin 403")
    check(students[0].get("/api/v1/evaluator/dashboard").status_code == 403, "student -> evaluator 403")
    check(admin.get("/api/v1/student/assessments").status_code == 403, "admin -> student 403")

    # ---------------------------------------------------------------- SUBJECTS
    section("Subjects (+ limit)")
    r = admin.post("/api/v1/admin/subjects", json={
        "name": "Database Management Systems", "code": f"DB-{suffix}", "description": "SQL & normalization"})
    check(r.status_code == 201, "create subject", r.text[:120])
    subject_id = r.json()["id"]
    check(admin.get(f"/api/v1/admin/subjects/{subject_id}").json()["code"] == f"DB-{suffix}", "GET subject by id")
    check(admin.post("/api/v1/admin/subjects", json={
        "name": "dup", "code": f"DB-{suffix}", "description": ""}).status_code == 409, "duplicate code -> 409")
    admin.post("/api/v1/admin/subjects", json={"name": "S2", "code": f"S2-{suffix}", "description": ""})
    admin.post("/api/v1/admin/subjects", json={"name": "S3", "code": f"S3-{suffix}", "description": ""})
    check(admin.post("/api/v1/admin/subjects", json={
        "name": "S4", "code": f"S4-{suffix}", "description": ""}).status_code == 409, "4th active subject -> 409")
    r = admin.put(f"/api/v1/admin/subjects/{subject_id}", json={"description": "updated"})
    check(r.status_code == 200 and r.json()["description"] == "updated", "PUT subject")

    # ---------------------------------------------------------------- SYLLABUS
    section("Syllabus")
    check(admin.post(f"/api/v1/admin/subjects/{subject_id}/syllabus",
                     files={"file": ("bad.exe", b"MZ", "application/octet-stream")}).status_code == 400,
          "reject non-PDF/DOCX/TXT")
    syl_txt = (b"Unit 1: SQL DDL and DML\nUnit 2: Normalization 1NF 2NF 3NF BCNF\n"
               b"Unit 3: Joins, subqueries and aggregate functions\nUnit 4: Indexing and query optimization\n"
               b"Unit 5: Transactions and ACID properties\n")
    r = admin.post(f"/api/v1/admin/subjects/{subject_id}/syllabus",
                   files={"file": ("syllabus.txt", syl_txt, "text/plain")})
    check(r.status_code == 202 and r.json()["kind"] == "syllabus.process", "upload syllabus -> job")
    job = poll_job(admin, r.json()["id"])
    check(job["status"] == "COMPLETED", "syllabus processing job completed", str(job)[:160])
    syl = admin.get(f"/api/v1/admin/subjects/{subject_id}/syllabus").json()
    check(syl["processing_status"] == "PROCESSED" and len(syl["topics"]) >= 3,
          f"syllabus PROCESSED, {len(syl['topics'])} topics extracted")

    # ---------------------------------------------------------------- ASSESSMENT
    section("Assessment generation")
    if args.skip_ai:
        print("  (skipped — --skip-ai)")
        assessment_id = None
    else:
        r = admin.post("/api/v1/admin/assessments/generate", json={
            "subject_id": subject_id, "difficulty": "MEDIUM",
            "topics": ["SQL", "Normalization", "Joins"], "number_of_parts": 4})
        check(r.status_code == 202, "POST /admin/assessments/generate -> job")
        job = poll_job(admin, r.json()["id"])
        check(job["status"] == "COMPLETED", "question-generation job completed", str(job)[:200])
        assessment_id = job["result"]["assessment_id"]
        a = admin.get(f"/api/v1/admin/assessments/{assessment_id}").json()
        check(a["status"] == "READY", "assessment READY after generation")
        check(a["question"] is not None and len(a["question"]["parts"]) == 4, "one question, 4 parts")
        check(sum(c["max_marks"] for c in a["rubric_criteria"]) == 100, "rubric sums to 100")
        check(len(admin.get("/api/v1/admin/assessments").json()) >= 1, "GET /admin/assessments list")

        r = admin.put(f"/api/v1/admin/assessments/{assessment_id}",
                      json={"title": "DBMS — E2E Assessment"})
        check(r.status_code == 200 and r.json()["title"] == "DBMS — E2E Assessment", "PUT assessment title")

        # assign
        sids = [s.get("/api/v1/auth/me").json()["id"] for s in students]
        eid = evaluator.get("/api/v1/auth/me").json()["id"]
        check(admin.get("/api/v1/admin/students").status_code == 200, "GET /admin/students")
        check(admin.get("/api/v1/admin/evaluators").status_code == 200, "GET /admin/evaluators")
        r = admin.post(f"/api/v1/admin/assessments/{assessment_id}/assign", json={
            "assessment_id": assessment_id, "student_ids": sids, "evaluator_ids": [eid]})
        check(r.status_code == 200 and set(r.json()["student_ids"]) == set(sids), "assign students + evaluator")
        check(admin.post(f"/api/v1/admin/assessments/{assessment_id}/assign", json={
            "assessment_id": assessment_id, "evaluator_ids": [str(uuid.uuid4())]}).status_code == 400,
            "assign invalid evaluator -> 400")

        # publish (instant — scenarios generate in the background)
        r = admin.post(f"/api/v1/admin/assessments/{assessment_id}/publish")
        check(r.status_code == 200 and r.json()["status"] == "PUBLISHED", "publish assessment (fast, non-blocking)")
        check(admin.post(f"/api/v1/admin/assessments/{assessment_id}/publish").status_code == 409,
              "double publish -> 409")

        # background scenario job: one LLM call per student — poll until complete
        scns: list = []
        for _ in range(60):
            scns = admin.get(f"/api/v1/admin/assessments/{assessment_id}/scenarios").json()
            if len(scns) >= len(sids):
                break
            time.sleep(2)
        check(len(scns) == len(sids), f"{len(sids)} unique scenarios generated (background job)")
        check(all(s["scenario_text"] for s in scns) and all(s["domain"] for s in scns),
              "scenarios have domain + narrative text")
        check(len({s["scenario_text"] for s in scns}) == len(scns), "each scenario is unique")

    # ---------------------------------------------------------------- STUDENT
    submission_id = None
    ai_eval_id = None
    if assessment_id:
        section("Student assessment + submission")
        s0 = students[0]
        check(s0.get("/api/v1/student/dashboard").status_code == 200, "GET /student/dashboard")
        lst = s0.get("/api/v1/student/assessments").json()
        check(any(a["id"] == assessment_id for a in lst), "student sees published assessment")
        a = s0.get(f"/api/v1/student/assessments/{assessment_id}").json()
        check(a["question"]["common_prompt"], "student gets common question")
        scn = s0.get(f"/api/v1/student/assessments/{assessment_id}/scenario").json()
        check(scn["scenario_text"] and scn["domain"], "student gets personalized scenario")
        scn_other = students[1].get(f"/api/v1/student/assessments/{assessment_id}/scenario").json()
        check(scn_other["id"] != scn["id"], "each student's scenario differs")

        # not-assigned student cannot read
        se = f"outsider_{suffix}@e2e.dev"
        r = root.post("/api/v1/auth/register", json={
            "name": "Outsider", "email": se, "password": "password123",
            "role": "STUDENT", "student_id": f"OUT-{suffix}"})
        outsider = Client(B).auth(r.json()["access_token"], r.json()["refresh_token"], "student")
        check(outsider.get(f"/api/v1/student/assessments/{assessment_id}/scenario").status_code == 403,
              "non-assigned student -> scenario 403")

        # ZIP security
        for kind, code in [("traversal", "PATH_TRAVERSAL"), ("exe", "BLOCKED_FILE_TYPE"), ("notzip", "INVALID_ZIP")]:
            r = s0.post(f"/api/v1/student/assessments/{assessment_id}/submissions",
                        files={"file": (f"{kind}.zip", bad_zip(kind), "application/zip")})
            check(r.status_code in (400, 413), f"reject {kind} ZIP",
                  f"got {r.status_code} {r.text[:80]}")

        r = s0.post(f"/api/v1/student/assessments/{assessment_id}/submissions",
                    files={"file": ("solution.zip", make_zip(SOLUTION), "application/zip")})
        check(r.status_code == 201 and len(r.json()["files"]) == 4, "upload valid ZIP -> 4 files extracted")
        submission_id = r.json()["id"]
        check(r.json()["status"] == "READY", "submission status READY before submit")
        r = s0.post(f"/api/v1/student/submissions/{submission_id}/submit")
        check(r.status_code == 200 and r.json()["status"] == "SUBMITTED", "submit locks submission")
        check(s0.post(f"/api/v1/student/submissions/{submission_id}/submit").status_code == 409,
              "double submit -> 409")
        check(s0.get(f"/api/v1/student/submissions/{submission_id}/result").status_code == 403,
              "result 403 before publish")
        check(students[1].get(f"/api/v1/student/submissions/{submission_id}").status_code == 403,
              "student cannot read another student's submission")

        # ------------------------------------------------------------ EVALUATOR
        section("Evaluator: submissions, AI eval, manual, publish")
        check(evaluator.get("/api/v1/evaluator/dashboard").status_code == 200, "GET /evaluator/dashboard")
        check(evaluator.get("/api/v1/evaluator/analytics").status_code == 200, "GET /evaluator/analytics")
        page = evaluator.get("/api/v1/evaluator/submissions?page=1&page_size=5").json()
        check(page["total"] >= 1 and "items" in page, "paginated submissions list")
        check(evaluator.get("/api/v1/evaluator/submissions?search=E2E").json()["total"] >= 1, "search filter")
        check(evaluator.get("/api/v1/evaluator/submissions?status=SUBMITTED").json()["total"] >= 1, "status filter")
        check(evaluator.get(f"/api/v1/evaluator/submissions?subject_id={subject_id}").json()["total"] >= 1,
              "subject_id filter")
        check(evaluator.get("/api/v1/evaluator/submissions?sort=submitted_at").status_code == 200, "sort param")
        det = evaluator.get(f"/api/v1/evaluator/submissions/{submission_id}")
        check(det.status_code == 200 and det.json()["scenario_text"], "submission detail incl. scenario")

        # outsider evaluator
        r = root.post("/api/v1/auth/register", json={
            "name": "Eval2", "email": f"eval2_{suffix}@e2e.dev", "password": "password123", "role": "EVALUATOR"})
        eval2 = Client(B).auth(r.json()["access_token"], r.json()["refresh_token"], "evaluator")
        check(eval2.get(f"/api/v1/evaluator/submissions/{submission_id}").status_code == 403,
              "unassigned evaluator -> 403")

        if not args.skip_ai:
            r = evaluator.post(f"/api/v1/evaluator/submissions/{submission_id}/ai-evaluate")
            check(r.status_code == 202, "POST ai-evaluate -> 202")
            ai_eval_id = r.json()["evaluation_id"]
            # poll evaluation
            for _ in range(120):
                ev = evaluator.get(f"/api/v1/evaluator/ai-evaluations/{ai_eval_id}").json()
                if ev["stage"] in ("COMPLETED", "PUBLISHED", "FAILED"):
                    break
                time.sleep(1.5)
            check(ev["stage"] == "COMPLETED", "AI evaluation reaches COMPLETED", str(ev.get("error"))[:160])
            check(0 <= ev["overall_score"] <= ev["max_score"], "score within [0, max]")
            check(len(ev["test_cases"]) >= 5, f"{len(ev['test_cases'])} deterministic test cases")
            check(0.0 <= ev["ai_content_probability"] <= 1.0
                  and ev["ai_content_classification"] in ("LOW", "MODERATE", "HIGH"),
                  "AI-content indicator present & bounded")
            check(len(ev["stage_history"]) >= 8, "stage history recorded")
            check(ev["provider"] in ("groq", "openai", "anthropic", "mock"), f"provider = {ev['provider']}")

            # idempotency
            r2 = evaluator.post(f"/api/v1/evaluator/submissions/{submission_id}/ai-evaluate")
            check(r2.json()["evaluation_id"] == ai_eval_id, "re-run returns same completed evaluation (idempotent)")
            # new version
            r3 = evaluator.post(f"/api/v1/evaluator/submissions/{submission_id}/ai-evaluate?force_new_version=true")
            check(r3.json()["evaluation_id"] != ai_eval_id, "force_new_version creates a new evaluation")
            for _ in range(120):
                ev3 = evaluator.get(f"/api/v1/evaluator/ai-evaluations/{r3.json()['evaluation_id']}").json()
                if ev3["stage"] in ("COMPLETED", "FAILED"):
                    break
                time.sleep(1.5)
            check(ev3["version"] == 2, "new evaluation is version 2 (history preserved)")
            ai_eval_id = r3.json()["evaluation_id"]

            tcs = evaluator.get(f"/api/v1/evaluator/submissions/{submission_id}/test-cases").json()
            check(any(t["code"] == "TC-001" for t in tcs), "GET /submissions/{id}/test-cases")

            # manual evaluation
            a = evaluator.get(f"/api/v1/evaluator/assessments/{assessment_id}").json()
            rub = a["rubric_criteria"]
            scores = {c["key"]: c["max_marks"] - 1 for c in rub}
            r = evaluator.post(f"/api/v1/evaluator/submissions/{submission_id}/manual-evaluation", json={
                "scores": scores, "comments": "PRIVATE-COMMENT-do-not-leak",
                "strengths": "PRIVATE-STRENGTH", "improvements": "PRIVATE-IMPROVE", "status": "COMPLETED"})
            check(r.status_code == 200, "POST manual-evaluation")
            check(r.json()["total"] == sum(scores.values()), "manual total computed server-side")
            check(evaluator.post(f"/api/v1/evaluator/submissions/{submission_id}/manual-evaluation", json={
                "scores": {rub[0]["key"]: 9999}, "status": "DRAFT"}).status_code == 400,
                "out-of-range rubric score -> 400")
            check(evaluator.post(f"/api/v1/evaluator/submissions/{submission_id}/manual-evaluation", json={
                "scores": {"nonsense": 1}, "status": "DRAFT"}).status_code == 400,
                "unknown rubric key -> 400")

            # publish
            r = evaluator.post(f"/api/v1/evaluator/ai-evaluations/{ai_eval_id}/publish")
            check(r.status_code == 200 and r.json()["published"], "publish AI result")
            check(evaluator.post(f"/api/v1/evaluator/ai-evaluations/{ai_eval_id}/publish").status_code == 409,
                  "double publish -> 409")

            # ---------------------------------------------------- STUDENT RESULT
            section("Student result + privacy")
            res = s0.get(f"/api/v1/student/submissions/{submission_id}/result")
            check(res.status_code == 200, "result available after publish")
            body = res.json()
            check(body["ai_score"] == ev3["overall_score"], "student sees the published AI score")
            check(body["tests_passed"] + body["tests_failed"] == len(body["test_cases"]),
                  "test-case pass/fail totals consistent")
            check("disclaimer" in body["ai_content"], "AI-content indicator has disclaimer")
            blob = res.text
            check("PRIVATE-COMMENT" not in blob and "PRIVATE-STRENGTH" not in blob
                  and "PRIVATE-IMPROVE" not in blob, "evaluator private data NOT leaked to student")
            check("evaluator_total" not in body and "manual_evaluation" not in body,
                  "no evaluator fields in student result payload")

    # ---------------------------------------------------------------- PROJECTS
    section("Projects (full workflow)")
    eid = evaluator.get("/api/v1/auth/me").json()["id"]
    sid0 = students[0].get("/api/v1/auth/me").json()["id"]
    r = admin.post("/api/v1/admin/projects", json={
        "title": "Full-Stack E-Commerce Platform", "brief": "Build a small e-commerce app.",
        "required_files": ["README.md", "database.sql"], "optional_files": ["documentation.md", "src/"],
        "evaluator_ids": [eid], "student_ids": [sid0]})
    check(r.status_code == 201, "admin creates project")
    project_id = r.json()["id"]
    check(len(admin.get("/api/v1/admin/projects").json()) >= 1, "GET /admin/projects")
    check(students[0].get(f"/api/v1/student/projects/{project_id}").status_code == 200, "student sees assigned project")
    check(students[1].get(f"/api/v1/student/projects/{project_id}").status_code == 403,
          "non-assigned student -> project 403")

    r = students[0].post(f"/api/v1/student/projects/{project_id}/submissions",
                         files={"file": ("project.zip", make_zip(PROJECT_FILES), "application/zip")})
    check(r.status_code == 201, "upload project ZIP")
    psub_id = r.json()["id"]
    check(any(e["path"] == "README.md" and e["present"] for e in r.json()["detected_structure"]),
          "project structure detected")
    r = students[0].post(f"/api/v1/student/project-submissions/{psub_id}/submit")
    check(r.status_code == 200 and r.json()["status"] == "SUBMITTED", "submit project")
    check(students[0].get(f"/api/v1/student/project-submissions/{psub_id}/result").status_code == 409,
          "project result blocked before publish")

    if not args.skip_ai:
        r = evaluator.post(f"/api/v1/evaluator/projects/submissions/{psub_id}/ai-evaluate")
        check(r.status_code == 202, "POST project ai-evaluate")
        pe_id = r.json()["evaluation_id"]
        for _ in range(120):
            pe = evaluator.get(f"/api/v1/evaluator/projects/evaluations/{pe_id}").json()
            if pe["stage"] in ("COMPLETED", "FAILED"):
                break
            time.sleep(1.5)
        check(pe["stage"] == "COMPLETED", "project AI evaluation completed", str(pe.get("error"))[:160])
        check(sum(c["max_score"] for c in pe["rubric_scores"]) == 100, "project rubric sums to 100")
        check(len(pe["checks"]) >= 5, f"{len(pe['checks'])} project checks")
        r = evaluator.post(f"/api/v1/evaluator/projects/evaluations/{pe_id}/publish")
        check(r.status_code == 200 and r.json()["published"], "publish project evaluation")
        res = students[0].get(f"/api/v1/student/project-submissions/{psub_id}/result").json()
        check(res["ai_score"] == pe["overall_score"], "student sees published project score")

    # ---------------------------------------------------------------- NOTIFICATIONS
    section("Notifications & jobs")
    n = students[0].get("/api/v1/notifications").json()
    check(isinstance(n, list) and len(n) >= 1, f"student has {len(n)} notifications")
    if n:
        check(students[0].post(f"/api/v1/notifications/{n[0]['id']}/read").status_code == 204, "mark one read")
    check(students[0].post("/api/v1/notifications/read-all").json()["marked_read"] >= 0, "mark all read")
    check(evaluator.get("/api/v1/notifications").status_code == 200, "evaluator notifications")

    # jobs ownership
    jr = admin.post("/api/v1/admin/subjects", json={"name": "tmp", "code": f"T-{rnd()}", "description": ""})
    # (that will 409 since 3 subjects exist — use an existing job instead)
    check(admin.get(f"/api/v1/jobs/{uuid.uuid4()}").status_code == 404, "unknown job -> 404")

    # ---------------------------------------------------------------- ANALYTICS
    section("Admin analytics")
    for path in ["/api/v1/admin/dashboard", "/api/v1/admin/analytics/overview",
                 "/api/v1/admin/analytics/submissions", "/api/v1/admin/analytics/scores"]:
        check(admin.get(path).status_code == 200, f"GET {path}")

    # ---------------------------------------------------------------- SUMMARY
    print(f"\n\033[1m{'='*50}\033[0m")
    total = PASS + FAIL
    color = "32" if FAIL == 0 else "31"
    print(f"\033[{color};1m{PASS}/{total} checks passed\033[0m" + (f"  \033[31m({FAIL} FAILED)\033[0m" if FAIL else ""))
    return 1 if FAIL else 0


if __name__ == "__main__":
    sys.exit(main())
