from __future__ import annotations

import pytest


@pytest.mark.parametrize("path", [
    "/api/v1/admin/subjects",
    "/api/v1/admin/dashboard",
    "/api/v1/admin/students",
])
def test_student_cannot_access_admin(client, student_auth, path):
    r = client.get(path, headers=student_auth["headers"])
    assert r.status_code == 403
    assert r.json()["error"]["code"] == "ROLE_FORBIDDEN"


def test_evaluator_cannot_access_admin(client, evaluator_auth):
    r = client.get("/api/v1/admin/subjects", headers=evaluator_auth["headers"])
    assert r.status_code == 403


def test_student_cannot_access_evaluator(client, student_auth):
    r = client.get("/api/v1/evaluator/dashboard", headers=student_auth["headers"])
    assert r.status_code == 403


def test_admin_cannot_access_student_endpoints(client, admin_auth):
    r = client.get("/api/v1/student/assessments", headers=admin_auth["headers"])
    assert r.status_code == 403
