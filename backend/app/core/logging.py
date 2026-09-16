from __future__ import annotations

import logging
import sys
import time
import uuid

from starlette.middleware.base import BaseHTTPMiddleware

_SENSITIVE = {"authorization", "cookie", "set-cookie", "x-api-key"}


def configure_logging(level: str = "INFO") -> None:
    root = logging.getLogger()
    if root.handlers:
        return
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s :: %(message)s"))
    root.addHandler(handler)
    root.setLevel(level)


logger = logging.getLogger("evalai")


class RequestLogMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        request_id = uuid.uuid4().hex[:12]
        request.state.request_id = request_id
        start = time.perf_counter()
        try:
            response = await call_next(request)
        except Exception:
            duration = (time.perf_counter() - start) * 1000
            logger.exception(
                "request_failed id=%s method=%s path=%s duration_ms=%.1f",
                request_id,
                request.method,
                request.url.path,
                duration,
            )
            raise
        duration = (time.perf_counter() - start) * 1000
        user_id = getattr(request.state, "user_id", "-")
        logger.info(
            "request id=%s method=%s path=%s status=%s user=%s duration_ms=%.1f",
            request_id,
            request.method,
            request.url.path,
            response.status_code,
            user_id,
            duration,
        )
        response.headers["X-Request-ID"] = request_id
        return response
