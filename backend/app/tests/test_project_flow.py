from __future__ import annotations

from app.tests.helpers import make_zip

PROJECT_FILES = {
    "README.md": "# E-Commerce\nSetup: npm install && npm start\n",
    "documentation.md": "## API\nGET /products ...\n",
    "database.sql": "CREATE TABLE product (id INTEGER PRIMARY KEY, title TEXT, price REAL);\n",
    "package.json": '{"name":"shop","version":"1.0.0","dependencies":{}}',
    "src/index.js": "console.log('app');\n",
    "public/index.html": "<!doctype html><title>Shop</title>",
}


def test_project_workflow(client, admin_auth, evaluator_auth, student_auth):
    eid = evaluator_auth["user"]["id"]
    sid = student_auth["user"]["id"]

    r = client.post("/api/v1/admin/projects", headers=admin_auth["headers"], json={
        "title": "Full-Stack E-Commerce Platform",
        "brief": "Build a small e-commerce app.",
        "required_files": ["README.md", "database.sql"],
        "optional_files": ["documentation.md", "src/", "public/"],
        "evaluator_ids": [eid],
        "student_ids": [sid],
    })
    assert r.status_code == 201, r.text
    project_id = r.json()["id"]

    sh, eh = student_auth["headers"], evaluator_auth["headers"]

    # student uploads + submits
    r = client.post(f"/api/v1/student/projects/{project_id}/submissions", headers=sh,
                    files={"file": ("project.zip", make_zip(PROJECT_FILES), "application/zip")})
    assert r.status_code == 201, r.text
    psub_id = r.json()["id"]
    assert any(e["path"] == "README.md" and e["present"] for e in r.json()["detected_structure"])

    r = client.post(f"/api/v1/student/project-submissions/{psub_id}/submit", headers=sh)
    assert r.status_code == 200
    assert r.json()["status"] == "SUBMITTED"

    # result blocked before publish
    assert client.get(f"/api/v1/student/project-submissions/{psub_id}/result", headers=sh).status_code == 409

    # evaluator runs AI evaluation (eager)
    r = client.post(f"/api/v1/evaluator/projects/submissions/{psub_id}/ai-evaluate", headers=eh)
    assert r.status_code == 202, r.text
    ev_id = r.json()["evaluation_id"]

    ev = client.get(f"/api/v1/evaluator/projects/evaluations/{ev_id}", headers=eh).json()
    assert ev["stage"] == "COMPLETED"
    assert 0 <= ev["overall_score"] <= ev["max_score"]
    assert len(ev["checks"]) >= 5
    assert sum(c["max_score"] for c in ev["rubric_scores"]) == 100

    # publish -> student sees it
    r = client.post(f"/api/v1/evaluator/projects/evaluations/{ev_id}/publish", headers=eh)
    assert r.status_code == 200 and r.json()["published"] is True

    res = client.get(f"/api/v1/student/project-submissions/{psub_id}/result", headers=sh)
    assert res.status_code == 200
    body = res.json()
    assert body["ai_score"] == ev["overall_score"]
    assert body["checks_passed"] + body["checks_failed"] == len(ev["checks"])
    assert "disclaimer" in body["ai_content"]


def test_student_cannot_access_unassigned_project(client, admin_auth, evaluator_auth, student_auth):
    r = client.post("/api/v1/admin/projects", headers=admin_auth["headers"], json={
        "title": "Private Project", "required_files": ["README.md"],
        "evaluator_ids": [evaluator_auth["user"]["id"]], "student_ids": [],
    })
    project_id = r.json()["id"]
    r = client.get(f"/api/v1/student/projects/{project_id}", headers=student_auth["headers"])
    assert r.status_code == 403
