from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager

from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import settings

connect_args: dict = {}
engine_kwargs: dict = {"pool_pre_ping": True, "future": True}

_is_memory = settings.DATABASE_URL in ("sqlite://", "sqlite:///:memory:")

if settings.is_sqlite:
    connect_args = {"check_same_thread": False}
    engine_kwargs.pop("pool_pre_ping", None)
    if _is_memory:
        # One shared connection so every Session sees the same in-memory DB.
        engine_kwargs["poolclass"] = StaticPool
else:
    # Serverless: each invocation is a short-lived process, so a big pool just
    # wastes connections against the DB's own limit. Keep it tiny and recycle
    # often — the pooled (pgbouncer) connection string handles the rest.
    engine_kwargs["pool_size"] = 1
    engine_kwargs["max_overflow"] = 1
    engine_kwargs["pool_recycle"] = 300

engine = create_engine(settings.DATABASE_URL, connect_args=connect_args, **engine_kwargs)

if settings.is_sqlite:

    @event.listens_for(engine, "connect")
    def _sqlite_pragmas(dbapi_conn, _):  # pragma: no cover - trivial
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA foreign_keys=ON")
        cur.execute("PRAGMA busy_timeout=15000")  # wait for the write lock instead of erroring
        if not _is_memory:
            cur.execute("PRAGMA journal_mode=WAL")  # concurrent readers during a write
            cur.execute("PRAGMA synchronous=NORMAL")
        cur.close()


SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True, expire_on_commit=False)


def get_db() -> Iterator[Session]:
    """FastAPI dependency: yields a session and always closes it."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@contextmanager
def session_scope() -> Iterator[Session]:
    """Transactional scope for scripts and background workers."""
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
