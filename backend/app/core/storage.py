from __future__ import annotations

import os
import shutil
import tempfile
import uuid
from abc import ABC, abstractmethod
from pathlib import Path

from app.core.config import settings


class Storage(ABC):
    @abstractmethod
    def save(self, data: bytes, *, prefix: str, filename: str) -> str:
        """Persist bytes; return an opaque storage key."""

    @abstractmethod
    def load(self, key: str) -> bytes: ...

    @abstractmethod
    def open_path(self, key: str) -> Path:
        """Return a local filesystem path for the object (downloading if needed)."""

    @abstractmethod
    def delete(self, key: str) -> None: ...


class LocalStorage(Storage):
    def __init__(self, root: str):
        self.root = Path(root).resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def _abs(self, key: str) -> Path:
        p = (self.root / key).resolve()
        if not str(p).startswith(str(self.root)):
            raise ValueError("Invalid storage key")
        return p

    def save(self, data: bytes, *, prefix: str, filename: str) -> str:
        safe = filename.replace("/", "_").replace("\\", "_")
        key = f"{prefix.strip('/')}/{uuid.uuid4().hex}_{safe}"
        dst = self._abs(key)
        dst.parent.mkdir(parents=True, exist_ok=True)
        dst.write_bytes(data)
        return key

    def load(self, key: str) -> bytes:
        return self._abs(key).read_bytes()

    def open_path(self, key: str) -> Path:
        return self._abs(key)

    def delete(self, key: str) -> None:
        p = self._abs(key)
        if p.exists():
            p.unlink()


class S3Storage(Storage):  # pragma: no cover - requires network / boto3
    def __init__(self):
        import boto3

        self._s3 = boto3.client(
            "s3",
            endpoint_url=settings.S3_ENDPOINT or None,
            region_name=settings.S3_REGION,
            aws_access_key_id=settings.S3_ACCESS_KEY,
            aws_secret_access_key=settings.S3_SECRET_KEY,
        )
        self.bucket = settings.S3_BUCKET
        # tempfile.gettempdir() (not STORAGE_PATH) because on serverless the app
        # bundle directory is read-only — only /tmp is writable per invocation.
        self._tmp = Path(tempfile.gettempdir()) / "evalai_s3cache"
        self._tmp.mkdir(parents=True, exist_ok=True)

    def save(self, data: bytes, *, prefix: str, filename: str) -> str:
        safe = filename.replace("/", "_").replace("\\", "_")
        key = f"{prefix.strip('/')}/{uuid.uuid4().hex}_{safe}"
        self._s3.put_object(Bucket=self.bucket, Key=key, Body=data)
        return key

    def load(self, key: str) -> bytes:
        obj = self._s3.get_object(Bucket=self.bucket, Key=key)
        return obj["Body"].read()

    def open_path(self, key: str) -> Path:
        local = self._tmp / key.replace("/", "__")
        if not local.exists():
            local.write_bytes(self.load(key))
        return local

    def delete(self, key: str) -> None:
        self._s3.delete_object(Bucket=self.bucket, Key=key)


class BlobStorage(Storage):  # pragma: no cover - requires network
    """Vercel Blob, via its plain HTTP API (no official Python SDK).

    The storage "key" we hand back to callers is the blob's public download
    URL — Vercel Blob has no separate read call keyed by pathname, only by
    URL, so storing the URL as the key avoids a second lookup.
    """

    API_BASE = "https://blob.vercel-storage.com"

    def __init__(self):
        import httpx

        if not settings.STORAGE_BLOB_TOKEN:
            raise RuntimeError("STORAGE_BLOB_TOKEN is required when STORAGE_BACKEND=blob")
        self._client = httpx.Client(
            headers={
                "Authorization": f"Bearer {settings.STORAGE_BLOB_TOKEN}",
                "x-api-version": "7",
            },
            timeout=60.0,
        )
        self._tmp = Path(tempfile.gettempdir()) / "evalai_blobcache"
        self._tmp.mkdir(parents=True, exist_ok=True)

    def save(self, data: bytes, *, prefix: str, filename: str) -> str:
        safe = filename.replace("/", "_").replace("\\", "_")
        pathname = f"{prefix.strip('/')}/{uuid.uuid4().hex}_{safe}"
        resp = self._client.put(
            f"{self.API_BASE}/{pathname}",
            content=data,
            headers={"content-type": "application/octet-stream"},
        )
        resp.raise_for_status()
        return resp.json()["url"]

    def load(self, key: str) -> bytes:
        resp = self._client.get(key)
        resp.raise_for_status()
        return resp.content

    def open_path(self, key: str) -> Path:
        local = self._tmp / uuid.uuid5(uuid.NAMESPACE_URL, key).hex
        if not local.exists():
            local.write_bytes(self.load(key))
        return local

    def delete(self, key: str) -> None:
        resp = self._client.post(f"{self.API_BASE}/delete", json={"urls": [key]})
        resp.raise_for_status()


_storage: Storage | None = None


def get_storage() -> Storage:
    global _storage
    if _storage is None:
        if settings.STORAGE_BACKEND == "blob":
            _storage = BlobStorage()
        elif settings.STORAGE_BACKEND == "s3":
            _storage = S3Storage()
        else:
            _storage = LocalStorage(settings.STORAGE_PATH)
    return _storage
