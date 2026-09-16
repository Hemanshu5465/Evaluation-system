from __future__ import annotations

import io
import zipfile


def make_zip(files: dict[str, str | bytes]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for name, content in files.items():
            zf.writestr(name, content if isinstance(content, (bytes, bytearray)) else content.encode())
    return buf.getvalue()


SOLUTION_FILES = {
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
        "JOIN patient p ON p.patient_id = a.patient_id "
        "JOIN doctor d ON d.doctor_id = a.doctor_id WHERE a.status = 'CONFIRMED';\n"
        "SELECT d.department_id, COUNT(*) c FROM appointment a "
        "JOIN doctor d ON d.doctor_id = a.doctor_id GROUP BY d.department_id HAVING COUNT(*) > 1;\n"
    ),
    "solution.sql": "-- see schema.sql and queries.sql\nSELECT 1;\n",
    "README.md": "# Hospital DB\nSchema for the hospital scenario. Assumptions documented here.\n",
}


def full_published_assessment(client, admin_headers, *, student_ids: list[str], evaluator_id: str) -> dict:
    """Drives the admin flow and returns {'assessment_id', 'subject_id'}."""
    # 1. subject
    r = client.post("/api/v1/admin/subjects", headers=admin_headers,
                    json={"name": "Database Management Systems", "code": f"CS-{_rand()}", "description": "SQL & normalization"})
    assert r.status_code == 201, r.text
    subject_id = r.json()["id"]

    # 2. syllabus (tiny txt) -> processed eagerly
    syllabus_txt = b"Unit 1: SQL DDL and DML\nUnit 2: Normalization 1NF 2NF 3NF\nUnit 3: Joins and Aggregates\n"
    r = client.post(
        f"/api/v1/admin/subjects/{subject_id}/syllabus",
        headers=admin_headers,
        files={"file": ("syllabus.txt", syllabus_txt, "text/plain")},
    )
    assert r.status_code == 202, r.text

    r = client.get(f"/api/v1/admin/subjects/{subject_id}/syllabus", headers=admin_headers)
    assert r.status_code == 200 and r.json()["processing_status"] == "PROCESSED", r.text

    # 3. generate assessment (eager) -> READY
    r = client.post("/api/v1/admin/assessments/generate", headers=admin_headers,
                    json={"subject_id": subject_id, "difficulty": "MEDIUM", "number_of_parts": 4})
    assert r.status_code == 202, r.text
    job = r.json()
    assert job["status"] == "COMPLETED", job
    assessment_id = job["result"]["assessment_id"]

    # 4. assign
    r = client.post(f"/api/v1/admin/assessments/{assessment_id}/assign", headers=admin_headers,
                    json={"assessment_id": assessment_id, "evaluator_ids": [evaluator_id], "student_ids": student_ids})
    assert r.status_code == 200, r.text

    # 5. publish
    r = client.post(f"/api/v1/admin/assessments/{assessment_id}/publish", headers=admin_headers)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "PUBLISHED"

    return {"assessment_id": assessment_id, "subject_id": subject_id}


_counter = [0]


def _rand() -> str:
    _counter[0] += 1
    return f"{_counter[0]:04d}"
