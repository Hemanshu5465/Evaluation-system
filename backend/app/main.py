from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.health import router as health_router
from app.api.router import api_router
from app.core.config import settings
from app.core.errors import register_exception_handlers
from app.core.logging import RequestLogMiddleware, configure_logging, logger

configure_logging("DEBUG" if settings.DEBUG else "INFO")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting %s (env=%s, ai=%s, eager=%s)", settings.PROJECT_NAME, settings.ENV,
                settings.AI_PROVIDER, settings.celery_eager)
    if settings.ENV == "test" or settings.is_sqlite:
        # Convenience for local/sqlite: ensure schema exists. Production uses Alembic.
        # NOTE: create_all only ADDS missing tables — it never drops or clears data.
        from app.core.database import engine
        from app.models import Base

        Base.metadata.create_all(bind=engine)

    # Show exactly which database file is in use and what it already holds, so a
    # "my data disappeared" situation is obvious from the startup log.
    if settings.is_sqlite:
        from sqlalchemy import func, select

        from app.core.database import SessionLocal
        from app.models.academic import Assessment
        from app.models.submission import Submission
        from app.models.user import User

        db_path = settings.DATABASE_URL.replace("sqlite:///", "")
        with SessionLocal() as db:
            users = db.scalar(select(func.count()).select_from(User)) or 0
            assessments = db.scalar(select(func.count()).select_from(Assessment)) or 0
            submissions = db.scalar(select(func.count()).select_from(Submission)) or 0
        logger.info(
            "Database %s — %s users, %s assessments, %s submissions (existing data preserved)",
            db_path, users, assessments, submissions,
        )
    yield


app = FastAPI(
    title=settings.PROJECT_NAME,
    description="Intelligent Assessment & Project Evaluation Platform — backend API.",
    version="1.0.0",
    lifespan=lifespan,
    openapi_tags=[
        {"name": "Authentication", "description": "Registration, login, JWT refresh & logout."},
        {"name": "Admin", "description": "Subjects, syllabi, assessment generation, publishing, assignments, analytics."},
        {"name": "Student", "description": "Assessments, personalized scenarios, submissions, results, projects."},
        {"name": "Evaluator", "description": "Assigned submissions, AI evaluation, manual grading, publishing."},
        {"name": "Notifications", "description": "Per-user notification centre."},
        {"name": "Jobs", "description": "Background job status polling."},
        {"name": "Health", "description": "Liveness / readiness probes."},
    ],
)

app.add_middleware(RequestLogMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

register_exception_handlers(app)

app.include_router(health_router)
app.include_router(api_router, prefix=settings.API_V1_PREFIX)


@app.get("/", tags=["Health"])
def root():
    return {
        "name": settings.PROJECT_NAME,
        "docs": "/docs",
        "openapi": "/openapi.json",
        "api": settings.API_V1_PREFIX,
    }
