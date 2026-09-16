from __future__ import annotations

from fastapi import HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


class AppError(HTTPException):
    """Application error with a machine-readable code."""

    def __init__(self, status_code: int, code: str, message: str):
        super().__init__(status_code=status_code, detail={"code": code, "message": message})
        self.code = code
        self.message = message


def not_found(code: str, message: str) -> AppError:
    return AppError(status.HTTP_404_NOT_FOUND, code, message)


def forbidden(code: str = "FORBIDDEN", message: str = "You do not have access to this resource.") -> AppError:
    return AppError(status.HTTP_403_FORBIDDEN, code, message)


def unauthorized(code: str = "UNAUTHORIZED", message: str = "Authentication required.") -> AppError:
    return AppError(status.HTTP_401_UNAUTHORIZED, code, message)


def conflict(code: str, message: str) -> AppError:
    return AppError(status.HTTP_409_CONFLICT, code, message)


def bad_request(code: str, message: str) -> AppError:
    return AppError(status.HTTP_400_BAD_REQUEST, code, message)


def payload_too_large(code: str, message: str) -> AppError:
    return AppError(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, code, message)


def unprocessable(code: str, message: str) -> AppError:
    return AppError(status.HTTP_422_UNPROCESSABLE_ENTITY, code, message)


def _envelope(code: str, message: str, extra: dict | None = None) -> dict:
    body = {"error": {"code": code, "message": message}}
    if extra:
        body["error"].update(extra)
    return body


def register_exception_handlers(app) -> None:
    @app.exception_handler(HTTPException)
    async def _http_exc(_: Request, exc: HTTPException):
        detail = exc.detail
        if isinstance(detail, dict) and "code" in detail:
            return JSONResponse(status_code=exc.status_code, content=_envelope(detail["code"], detail["message"]))
        return JSONResponse(
            status_code=exc.status_code,
            content=_envelope("HTTP_ERROR", str(detail)),
        )

    @app.exception_handler(RequestValidationError)
    async def _validation_exc(_: Request, exc: RequestValidationError):
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content=_envelope("VALIDATION_ERROR", "Request validation failed.", {"details": exc.errors()}),
        )

    @app.exception_handler(Exception)
    async def _unhandled(_: Request, exc: Exception):  # pragma: no cover
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=_envelope("INTERNAL_ERROR", "An unexpected error occurred."),
        )
