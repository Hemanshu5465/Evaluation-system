from __future__ import annotations


def test_admin_creates_evaluator(client, admin_auth):
    r = client.post(
        "/api/v1/admin/evaluators",
        headers=admin_auth["headers"],
        json={"name": "New Evaluator", "email": "new.evaluator@test.dev", "department": "CS"},
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["username"] == "new.evaluator@test.dev"
    assert len(body["password"]) >= 8
    assert body["user"]["role"] == "EVALUATOR"
    assert body["user"]["email"] == "new.evaluator@test.dev"

    # shows up in the evaluators list
    listed = client.get("/api/v1/admin/evaluators", headers=admin_auth["headers"]).json()
    assert any(u["email"] == "new.evaluator@test.dev" for u in listed)

    # the generated password actually works
    login = client.post(
        "/api/v1/auth/login", json={"identifier": "new.evaluator@test.dev", "password": body["password"]}
    )
    assert login.status_code == 200, login.text
    assert login.json()["user"]["role"] == "EVALUATOR"


def test_create_evaluator_duplicate_email_conflicts(client, admin_auth, evaluator_auth):
    r = client.post(
        "/api/v1/admin/evaluators",
        headers=admin_auth["headers"],
        json={"name": "Dup", "email": evaluator_auth["user"]["email"]},
    )
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "EMAIL_TAKEN"


def test_non_admin_cannot_create_evaluator(client, evaluator_auth, student_auth):
    for auth in (evaluator_auth, student_auth):
        r = client.post(
            "/api/v1/admin/evaluators",
            headers=auth["headers"],
            json={"name": "Nope", "email": "nope@test.dev"},
        )
        assert r.status_code == 403
