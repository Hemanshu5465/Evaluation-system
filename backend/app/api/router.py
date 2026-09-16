from __future__ import annotations

from fastapi import APIRouter

from app.api import admin, auth, evaluator, jobs, notifications, student

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(admin.router)
api_router.include_router(student.router)
api_router.include_router(evaluator.router)
api_router.include_router(notifications.router)
api_router.include_router(jobs.router)
