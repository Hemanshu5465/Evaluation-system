from __future__ import annotations

import os
import pathlib
import uuid

import pytest

# Configure the environment BEFORE anything imports app.core.config.
os.environ.update(
    ENV="test",
    DEBUG="false",
    DATABASE_URL="sqlite://",  # shared in-memory (StaticPool)
    REDIS_URL="",
    CELERY_TASK_ALWAYS_EAGER="true",
    AI_PROVIDER="mock",
    JWT_SECRET_KEY="test-secret",
    STORAGE_BACKEND="local",
    STORAGE_PATH=str(pathlib.Path(__file__).parent / "_test_uploads"),
    MAX_ACTIVE_SUBJECTS="3",
)

from fastapi.testclient import TestClient  # noqa: E402

from app.core.database import SessionLocal, engine  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Base  # noqa: E402
from app.models.enums import Role  # noqa: E402
from app.models.user import User  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def _db_schema():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture(autouse=True)
def _clean_tables():
    yield
    with engine.begin() as conn:
        for table in reversed(Base.metadata.sorted_tables):
            conn.exec_driver_sql(f'DELETE FROM "{table.name}"')


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def db():
    s = SessionLocal()
    try:
        yield s
    finally:
        s.close()


def _make_user(role: Role, email: str, **extra) -> User:
    s = SessionLocal()
    try:
        u = User(
            name=email.split("@")[0].title(),
            email=email,
            password_hash=hash_password("password123"),
            role=role,
            is_active=True,
            **extra,
        )
        s.add(u)
        s.commit()
        s.refresh(u)
        return u
    finally:
        s.close()


def _login(client: TestClient, email: str) -> dict:
    r = client.post("/api/v1/auth/login", json={"email": email, "password": "password123"})
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture
def admin_auth(client):
    _make_user(Role.ADMIN, "admin@test.dev")
    data = _login(client, "admin@test.dev")
    return {"headers": {"Authorization": f"Bearer {data['access_token']}"}, "user": data["user"], "tokens": data}


@pytest.fixture
def evaluator_auth(client):
    _make_user(Role.EVALUATOR, "eval@test.dev", department="CS")
    data = _login(client, "eval@test.dev")
    return {"headers": {"Authorization": f"Bearer {data['access_token']}"}, "user": data["user"], "tokens": data}


@pytest.fixture
def student_auth(client):
    _make_user(Role.STUDENT, "student@test.dev", student_id=f"S-{uuid.uuid4().hex[:6]}")
    data = _login(client, "student@test.dev")
    return {"headers": {"Authorization": f"Bearer {data['access_token']}"}, "user": data["user"], "tokens": data}
