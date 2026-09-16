from __future__ import annotations

from fastapi import APIRouter
from sqlalchemy import text

from app.core.config import settings
from app.core.database import engine

router = APIRouter(tags=["Health"])


@router.get("/health")
def health():
    return {"status": "healthy", "env": settings.ENV, "ai_provider": settings.AI_PROVIDER}


@router.get("/health/db")
def health_db():
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {"database": "healthy"}
    except Exception as e:  # pragma: no cover
        return {"database": "unhealthy", "error": str(e)}


@router.get("/health/redis")
def health_redis():
    if settings.celery_eager:
        return {"redis": "not_configured", "mode": "eager", "note": "tasks run inline"}
    try:
        import redis

        r = redis.from_url(settings.REDIS_URL)
        r.ping()
        return {"redis": "healthy"}
    except Exception as e:  # pragma: no cover
        return {"redis": "unhealthy", "error": str(e)}
