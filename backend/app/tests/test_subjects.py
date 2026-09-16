from __future__ import annotations


def test_create_subject(client, admin_auth):
    r = client.post("/api/v1/admin/subjects", headers=admin_auth["headers"],
                    json={"name": "DBMS", "code": "CS-DB-1", "description": "x"})
    assert r.status_code == 201
    assert r.json()["code"] == "CS-DB-1"


def test_max_three_subjects(client, admin_auth):
    for i in range(3):
        r = client.post("/api/v1/admin/subjects", headers=admin_auth["headers"],
                        json={"name": f"S{i}", "code": f"C-{i}", "description": ""})
        assert r.status_code == 201
    r = client.post("/api/v1/admin/subjects", headers=admin_auth["headers"],
                    json={"name": "S4", "code": "C-4", "description": ""})
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "SUBJECT_LIMIT_REACHED"


def test_duplicate_code_rejected(client, admin_auth):
    client.post("/api/v1/admin/subjects", headers=admin_auth["headers"],
                json={"name": "Alpha", "code": "DUP", "description": ""})
    r = client.post("/api/v1/admin/subjects", headers=admin_auth["headers"],
                    json={"name": "Bravo", "code": "DUP", "description": ""})
    assert r.status_code == 409


def test_syllabus_upload_and_processing(client, admin_auth):
    sid = client.post("/api/v1/admin/subjects", headers=admin_auth["headers"],
                      json={"name": "DBMS", "code": "CS-DB-9", "description": ""}).json()["id"]
    r = client.post(
        f"/api/v1/admin/subjects/{sid}/syllabus", headers=admin_auth["headers"],
        files={"file": ("syllabus.txt", b"Unit 1: SQL\nUnit 2: Normalization\nUnit 3: Indexing\n", "text/plain")},
    )
    assert r.status_code == 202
    assert r.json()["kind"] == "syllabus.process"

    got = client.get(f"/api/v1/admin/subjects/{sid}/syllabus", headers=admin_auth["headers"]).json()
    assert got["processing_status"] == "PROCESSED"
    assert len(got["topics"]) >= 3


def test_syllabus_rejects_bad_type(client, admin_auth):
    sid = client.post("/api/v1/admin/subjects", headers=admin_auth["headers"],
                      json={"name": "Xylo", "code": "CS-DB-77", "description": ""}).json()["id"]
    r = client.post(f"/api/v1/admin/subjects/{sid}/syllabus", headers=admin_auth["headers"],
                    files={"file": ("bad.exe", b"MZ", "application/octet-stream")})
    assert r.status_code == 400
