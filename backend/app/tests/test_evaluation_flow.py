from __future__ import annotations

from app.tests.helpers import SOLUTION_FILES, full_published_assessment, make_zip


def _bootstrap(client, admin_auth, evaluator_auth, student_auth):
    return full_published_assessment(
        client,
        admin_auth["headers"],
        student_ids=[student_auth["user"]["id"]],
        evaluator_id=evaluator_auth["user"]["id"],
    )


def test_full_workflow(client, admin_auth, evaluator_auth, student_auth):
    ctx = _bootstrap(client, admin_auth, evaluator_auth, student_auth)
    aid = ctx["assessment_id"]
    sh, eh = student_auth["headers"], evaluator_auth["headers"]

    # --- student sees a common question + a personalized scenario ---
    a = client.get(f"/api/v1/student/assessments/{aid}", headers=sh).json()
    assert a["question"]["common_prompt"]
    scn = client.get(f"/api/v1/student/assessments/{aid}/scenario", headers=sh)
    assert scn.status_code == 200
    assert scn.json()["scenario_text"]
    assert scn.json()["domain"]

    # --- student uploads + submits ---
    zip_bytes = make_zip(SOLUTION_FILES)
    r = client.post(f"/api/v1/student/assessments/{aid}/submissions", headers=sh,
                    files={"file": ("solution.zip", zip_bytes, "application/zip")})
    assert r.status_code == 201, r.text
    submission_id = r.json()["id"]
    assert len(r.json()["files"]) == 4

    r = client.post(f"/api/v1/student/submissions/{submission_id}/submit", headers=sh)
    assert r.status_code == 200
    assert r.json()["status"] == "SUBMITTED"

    # result not available before publishing
    assert client.get(f"/api/v1/student/submissions/{submission_id}/result", headers=sh).status_code == 403

    # --- evaluator runs AI evaluation (eager) ---
    r = client.post(f"/api/v1/evaluator/submissions/{submission_id}/ai-evaluate", headers=eh)
    assert r.status_code == 202, r.text
    evaluation_id = r.json()["evaluation_id"]

    ev = client.get(f"/api/v1/evaluator/ai-evaluations/{evaluation_id}", headers=eh).json()
    assert ev["stage"] == "COMPLETED"
    assert 0 <= ev["overall_score"] <= ev["max_score"]
    assert len(ev["test_cases"]) >= 5
    assert 0.0 <= ev["ai_content_probability"] <= 1.0
    assert ev["ai_content_classification"] in {"LOW", "MODERATE", "HIGH"}

    # test-case endpoint
    tcs = client.get(f"/api/v1/evaluator/submissions/{submission_id}/test-cases", headers=eh).json()
    assert any(tc["code"] == "TC-001" for tc in tcs)

    # --- idempotency: starting again returns the completed evaluation, not a new one ---
    r2 = client.post(f"/api/v1/evaluator/submissions/{submission_id}/ai-evaluate", headers=eh)
    assert r2.json()["evaluation_id"] == evaluation_id

    # --- manual evaluation: total computed server-side, scores range-checked ---
    a_full = client.get(f"/api/v1/student/assessments/{aid}", headers=student_auth["headers"]).json()
    rubric = a_full["rubric_criteria"]
    scores = {c["key"]: c["max_marks"] - 1 for c in rubric}
    r = client.post(f"/api/v1/evaluator/submissions/{submission_id}/manual-evaluation", headers=eh,
                    json={"scores": scores, "comments": "solid", "status": "COMPLETED"})
    assert r.status_code == 200, r.text
    manual = r.json()
    assert manual["total"] == sum(scores.values())
    assert manual["status"] == "COMPLETED"

    # out-of-range score rejected
    bad = client.post(f"/api/v1/evaluator/submissions/{submission_id}/manual-evaluation", headers=eh,
                      json={"scores": {rubric[0]["key"]: 999}, "status": "DRAFT"})
    assert bad.status_code == 400

    # --- publish AI result ---
    r = client.post(f"/api/v1/evaluator/ai-evaluations/{evaluation_id}/publish", headers=eh)
    assert r.status_code == 200
    assert r.json()["published"] is True

    # double publish rejected
    assert client.post(f"/api/v1/evaluator/ai-evaluations/{evaluation_id}/publish", headers=eh).status_code == 409

    # --- student now sees the published AI result ---
    res = client.get(f"/api/v1/student/submissions/{submission_id}/result", headers=sh)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["status"] == "PUBLISHED"
    assert body["ai_score"] == ev["overall_score"]
    assert body["tests_passed"] + body["tests_failed"] == len(ev["test_cases"])
    assert "disclaimer" in body["ai_content"]


def test_ai_evaluation_requires_submitted(client, admin_auth, evaluator_auth, student_auth):
    ctx = _bootstrap(client, admin_auth, evaluator_auth, student_auth)
    aid = ctx["assessment_id"]
    zip_bytes = make_zip(SOLUTION_FILES)
    r = client.post(f"/api/v1/student/assessments/{aid}/submissions", headers=student_auth["headers"],
                    files={"file": ("solution.zip", zip_bytes, "application/zip")})
    submission_id = r.json()["id"]
    # not submitted yet
    r = client.post(f"/api/v1/evaluator/submissions/{submission_id}/ai-evaluate", headers=evaluator_auth["headers"])
    assert r.status_code == 400
    assert r.json()["error"]["code"] == "NOT_SUBMITTED"
