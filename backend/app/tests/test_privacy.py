from __future__ import annotations

import json

from app.tests.helpers import SOLUTION_FILES, full_published_assessment, make_zip


def _prepare(client, admin_auth, evaluator_auth, student_auth):
    ctx = full_published_assessment(
        client, admin_auth["headers"],
        student_ids=[student_auth["user"]["id"]],
        evaluator_id=evaluator_auth["user"]["id"],
    )
    aid = ctx["assessment_id"]
    sh, eh = student_auth["headers"], evaluator_auth["headers"]
    sub_id = client.post(f"/api/v1/student/assessments/{aid}/submissions", headers=sh,
                         files={"file": ("s.zip", make_zip(SOLUTION_FILES), "application/zip")}).json()["id"]
    client.post(f"/api/v1/student/submissions/{sub_id}/submit", headers=sh)
    ev_id = client.post(f"/api/v1/evaluator/submissions/{sub_id}/ai-evaluate", headers=eh).json()["evaluation_id"]

    rubric = client.get(f"/api/v1/student/assessments/{aid}", headers=sh).json()["rubric_criteria"]
    client.post(f"/api/v1/evaluator/submissions/{sub_id}/manual-evaluation", headers=eh, json={
        "scores": {c["key"]: c["max_marks"] for c in rubric},
        "comments": "SECRET evaluator comment do-not-leak",
        "strengths": "SECRET strengths", "improvements": "SECRET improvements",
        "status": "COMPLETED",
    })
    client.post(f"/api/v1/evaluator/ai-evaluations/{ev_id}/publish", headers=eh)
    return {"assessment_id": aid, "submission_id": sub_id, "student_headers": sh}


def test_student_result_excludes_evaluator_private_data(client, admin_auth, evaluator_auth, student_auth):
    ctx = _prepare(client, admin_auth, evaluator_auth, student_auth)
    res = client.get(f"/api/v1/student/submissions/{ctx['submission_id']}/result", headers=ctx["student_headers"])
    assert res.status_code == 200
    blob = json.dumps(res.json())
    assert "SECRET" not in blob
    for forbidden_key in ("evaluator_marks", "manual_evaluation", "evaluator_total", "comments", "improvements"):
        assert forbidden_key not in res.json()


def test_student_cannot_hit_evaluator_manual_endpoints(client, admin_auth, evaluator_auth, student_auth):
    ctx = _prepare(client, admin_auth, evaluator_auth, student_auth)
    r = client.post(
        f"/api/v1/evaluator/submissions/{ctx['submission_id']}/manual-evaluation",
        headers=ctx["student_headers"],
        json={"scores": {}, "status": "DRAFT"},
    )
    assert r.status_code == 403


def test_scenario_endpoint_is_per_student(client, admin_auth, evaluator_auth, student_auth):
    ctx = _prepare(client, admin_auth, evaluator_auth, student_auth)
    aid = ctx["assessment_id"]

    # the first student's own scenario
    mine = client.get(f"/api/v1/student/assessments/{aid}/scenario", headers=ctx["student_headers"]).json()

    # a second assigned student — publish assigns every student, so they're in too
    r = client.post("/api/v1/auth/register", json={
        "name": "Other Student", "email": "other@stud.dev", "password": "password123",
        "role": "STUDENT", "student_id": "S-OTHER",
    })
    other_headers = {"Authorization": f"Bearer {r.json()['access_token']}"}
    theirs = client.get(f"/api/v1/student/assessments/{aid}/scenario", headers=other_headers)
    assert theirs.status_code == 200
    # the endpoint always returns the *caller's* scenario, never someone else's
    assert theirs.json()["id"] != mine["id"]


def test_non_student_cannot_read_a_scenario(client, admin_auth, evaluator_auth, student_auth):
    ctx = _prepare(client, admin_auth, evaluator_auth, student_auth)
    r = client.get(f"/api/v1/student/assessments/{ctx['assessment_id']}/scenario", headers=evaluator_auth["headers"])
    assert r.status_code == 403


def test_evaluator_cannot_access_unassigned_submission(client, admin_auth, evaluator_auth, student_auth):
    ctx = _prepare(client, admin_auth, evaluator_auth, student_auth)
    r = client.post("/api/v1/auth/register", json={
        "name": "Eval2", "email": "eval2@dev.dev", "password": "password123",
        "role": "EVALUATOR",
    })
    other_eval = {"Authorization": f"Bearer {r.json()['access_token']}"}
    r = client.get(f"/api/v1/evaluator/submissions/{ctx['submission_id']}", headers=other_eval)
    assert r.status_code == 403
