from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# backend/  — the folder that holds .env, alembic.ini, evalai.db, uploads/
BACKEND_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        # absolute path so `.env` is found no matter the working directory
        env_file=str(BACKEND_ROOT / ".env"),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Application
    ENV: Literal["development", "production", "test"] = "development"
    DEBUG: bool = True
    API_V1_PREFIX: str = "/api/v1"
    PROJECT_NAME: str = "EvalAI"

    # Database
    DATABASE_URL: str = "sqlite:///./evalai.db"

    # Redis / Celery
    REDIS_URL: str = ""
    CELERY_TASK_ALWAYS_EAGER: bool = False

    # JWT
    JWT_SECRET_KEY: str = "insecure-dev-secret-change-me"
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    JWT_REFRESH_TOKEN_EXPIRE_DAYS: int = 14

    # AI provider
    AI_PROVIDER: Literal["mock", "anthropic", "openai", "groq"] = "mock"
    ANTHROPIC_API_KEY: str = ""
    ANTHROPIC_MODEL: str = "claude-sonnet-5"
    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = "gpt-4o"
    OPENAI_BASE_URL: str = ""  # override for OpenAI-compatible gateways
    GROQ_API_KEY: str = ""
    GROQ_MODEL: str = "openai/gpt-oss-20b"          # question / scenario / syllabus
    # Model for answer & project evaluation. Point at a *different* model (e.g.
    # openai/gpt-oss-120b) to get a separate rate-limit bucket + higher quality,
    # but only on a paid key — the 120b free-tier daily limit is small.
    GROQ_EVAL_MODEL: str = "openai/gpt-oss-20b"
    GROQ_BASE_URL: str = "https://api.groq.com/openai/v1"
    AI_MAX_RETRIES: int = 1  # re-asks on unparseable JSON (gpt-oss honours json_object mode)
    AI_TIMEOUT_SECONDS: int = 60
    AI_RATE_LIMIT_RETRIES: int = 3  # retries on a short (per-minute) 429
    AI_RATE_LIMIT_MAX_WAIT_S: int = 20  # a Retry-After longer than this = daily quota -> fail fast, don't sleep
    AI_SCENARIO_GEN_DELAY_MS: int = 250  # pause between per-student scenario calls
    EAGER_SCENARIO_GENERATION: bool = False  # False -> generate each scenario lazily on first student open

    # Storage
    STORAGE_BACKEND: Literal["local", "s3"] = "local"
    STORAGE_PATH: str = "./uploads"
    S3_ENDPOINT: str = ""
    S3_REGION: str = "us-east-1"
    S3_BUCKET: str = "evalai"
    S3_ACCESS_KEY: str = ""
    S3_SECRET_KEY: str = ""

    # Upload / ZIP limits
    MAX_UPLOAD_SIZE: int = 50 * 1024 * 1024
    MAX_ZIP_FILES: int = 400
    MAX_UNCOMPRESSED_SIZE: int = 250 * 1024 * 1024
    MAX_ZIP_RATIO: int = 120
    MAX_ZIP_DEPTH: int = 1

    # SQL sandbox
    SQL_SANDBOX_TIMEOUT_SECONDS: int = 5
    SQL_SANDBOX_MAX_ROWS: int = 10_000

    # CORS
    CORS_ORIGINS: str = "http://localhost:5173"

    # Business rules
    MAX_ACTIVE_SUBJECTS: int = 50

    # Bootstrap admin
    FIRST_ADMIN_EMAIL: str = "admin@example.com"
    FIRST_ADMIN_PASSWORD: str = ""
    FIRST_ADMIN_NAME: str = "Platform Admin"

    @field_validator("CORS_ORIGINS")
    @classmethod
    def _strip(cls, v: str) -> str:
        return v.strip()

    @field_validator("DATABASE_URL")
    @classmethod
    def _anchor_sqlite_path(cls, v: str) -> str:
        """A relative sqlite path (``sqlite:///./evalai.db``) resolves against the
        current working directory, so running the API, Alembic and the scripts
        from different folders would each hit a different file — and data would
        look like it "disappeared" on restart. Anchor it to backend/ instead."""
        prefix = "sqlite:///"
        if not v.startswith(prefix) or v.startswith("sqlite:////"):
            return v  # non-sqlite, in-memory, or already an absolute path
        rel = v[len(prefix):]
        if rel in ("", ":memory:") or Path(rel).is_absolute():
            return v
        return f"{prefix}{(BACKEND_ROOT / rel).resolve().as_posix()}"

    @field_validator("STORAGE_PATH")
    @classmethod
    def _anchor_storage_path(cls, v: str) -> str:
        """Same reasoning as the DB path: keep uploaded files in one place
        (backend/uploads) regardless of the process working directory."""
        return v if Path(v).is_absolute() else str((BACKEND_ROOT / v).resolve())

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def celery_eager(self) -> bool:
        # No broker configured -> run tasks synchronously so the API still works.
        return self.CELERY_TASK_ALWAYS_EAGER or not self.REDIS_URL

    @property
    def is_sqlite(self) -> bool:
        return self.DATABASE_URL.startswith("sqlite")


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
