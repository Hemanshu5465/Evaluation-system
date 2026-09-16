from __future__ import annotations

from celery import Celery

from app.core.config import settings

celery_app = Celery("evalai")

celery_app.conf.update(
    broker_url=settings.REDIS_URL or "memory://",
    result_backend=settings.REDIS_URL or "cache+memory://",
    task_always_eager=settings.celery_eager,
    task_eager_propagates=True,
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    task_track_started=True,
    worker_max_tasks_per_child=200,
    task_time_limit=600,
    task_soft_time_limit=540,
)

# Ensure task modules are imported so they register with the app.
celery_app.autodiscover_tasks(
    [
        "app.workers.syllabus_tasks",
        "app.workers.assessment_tasks",
        "app.workers.evaluation_tasks",
        "app.workers.project_tasks",
    ]
)

import app.workers.assessment_tasks  # noqa: E402,F401
import app.workers.evaluation_tasks  # noqa: E402,F401
import app.workers.project_tasks  # noqa: E402,F401
import app.workers.syllabus_tasks  # noqa: E402,F401
