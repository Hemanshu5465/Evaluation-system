from __future__ import annotations


def test_register_and_me(client):
    r = client.post("/api/v1/auth/register", json={
        "name": "New Student", "email": "new@student.dev", "password": "supersecret",
        "role": "STUDENT", "student_id": "S-9001",
    })
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["user"]["role"] == "STUDENT"
    assert body["access_token"] and body["refresh_token"]

    me = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {body['access_token']}"})
    assert me.status_code == 200
    assert me.json()["email"] == "new@student.dev"


def test_login_wrong_password(client, student_auth):
    r = client.post("/api/v1/auth/login", json={"email": "student@test.dev", "password": "wrong"})
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "INVALID_CREDENTIALS"


def test_refresh_rotation_and_reuse_detection(client, student_auth):
    tokens = student_auth["tokens"]
    r1 = client.post("/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert r1.status_code == 200
    new_refresh = r1.json()["refresh_token"]
    assert new_refresh != tokens["refresh_token"]

    # old refresh token is now revoked -> reuse detection
    r2 = client.post("/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert r2.status_code == 401
    assert r2.json()["error"]["code"] == "REFRESH_REUSED"

    # and the family is revoked, so the rotated token no longer works either
    r3 = client.post("/api/v1/auth/refresh", json={"refresh_token": new_refresh})
    assert r3.status_code == 401


def test_logout_revokes_refresh(client, student_auth):
    tokens = student_auth["tokens"]
    r = client.post("/api/v1/auth/logout", headers=student_auth["headers"],
                    json={"refresh_token": tokens["refresh_token"]})
    assert r.status_code == 204
    r = client.post("/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert r.status_code == 401


def test_missing_token(client):
    assert client.get("/api/v1/auth/me").status_code == 401
