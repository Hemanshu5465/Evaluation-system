from __future__ import annotations

import hashlib
import io
import mimetypes
import posixpath
import zipfile
from dataclasses import dataclass, field

from app.core.config import settings
from app.core.errors import bad_request, payload_too_large

# Extensions we refuse to extract from an archive (defence in depth).
_BLOCKED_EXT = {
    ".exe", ".dll", ".so", ".dylib", ".bin", ".msi", ".bat", ".cmd", ".com",
    ".scr", ".sh", ".ps1", ".jar", ".apk", ".deb", ".rpm",
}
_ARCHIVE_EXT = {".zip", ".rar", ".7z", ".tar", ".gz", ".tgz", ".bz2"}

_TEXT_EXT = {
    ".sql", ".md", ".txt", ".json", ".py", ".js", ".ts", ".tsx", ".jsx", ".java",
    ".c", ".cpp", ".h", ".hpp", ".cs", ".rb", ".go", ".rs", ".php", ".html", ".css",
    ".yaml", ".yml", ".toml", ".ini", ".cfg", ".env", ".xml", ".csv",
}


@dataclass
class ExtractedFile:
    path: str
    filename: str
    extension: str
    size_bytes: int
    mime_type: str
    sha256: str
    is_text: bool
    data: bytes = field(repr=False, default=b"")


@dataclass
class ExtractionResult:
    files: list[ExtractedFile]
    total_uncompressed: int
    archive_sha256: str


class ZipSecurityError(Exception):
    pass


def _is_within(base: str, target: str) -> bool:
    base = posixpath.normpath(base)
    target = posixpath.normpath(posixpath.join(base, target))
    return target == base or target.startswith(base + "/")


def validate_archive_bytes(data: bytes) -> None:
    if len(data) > settings.MAX_UPLOAD_SIZE:
        raise payload_too_large(
            "ARCHIVE_TOO_LARGE",
            f"Archive exceeds the {settings.MAX_UPLOAD_SIZE // (1024 * 1024)} MB limit.",
        )
    if not zipfile.is_zipfile(io.BytesIO(data)):
        raise bad_request("INVALID_ZIP", "File is not a valid ZIP archive.")


def safe_extract(data: bytes, *, depth: int = 0) -> ExtractionResult:
    """Extract a ZIP in memory with full protection against traversal, bombs and dangerous files."""
    validate_archive_bytes(data)
    archive_sha = hashlib.sha256(data).hexdigest()

    files: list[ExtractedFile] = []
    total_uncompressed = 0
    total_compressed = max(len(data), 1)

    with zipfile.ZipFile(io.BytesIO(data)) as zf:
        infos = zf.infolist()

        if len(infos) > settings.MAX_ZIP_FILES:
            raise bad_request(
                "TOO_MANY_FILES", f"Archive has {len(infos)} entries (limit {settings.MAX_ZIP_FILES})."
            )

        # Pre-flight: declared uncompressed size + zip-bomb ratio.
        declared = sum(i.file_size for i in infos)
        if declared > settings.MAX_UNCOMPRESSED_SIZE:
            raise bad_request(
                "UNCOMPRESSED_TOO_LARGE",
                f"Declared uncompressed size {declared} exceeds limit {settings.MAX_UNCOMPRESSED_SIZE}.",
            )
        if declared / total_compressed > settings.MAX_ZIP_RATIO:
            raise bad_request("ZIP_BOMB", "Archive compression ratio is suspiciously high (possible zip bomb).")

        for info in infos:
            name = info.filename

            # Directory entries
            if name.endswith("/"):
                continue

            # Path traversal / absolute paths / drive letters / NUL
            norm = name.replace("\\", "/")
            if "\x00" in norm:
                raise bad_request("BAD_PATH", "Archive contains a null byte in a file path.")
            if norm.startswith("/") or (len(norm) > 1 and norm[1] == ":"):
                raise bad_request("BAD_PATH", f"Absolute path not allowed: {name}")
            if ".." in norm.split("/") or not _is_within("root", norm):
                raise bad_request("PATH_TRAVERSAL", f"Path traversal attempt detected: {name}")

            # Symlinks (unix mode bits in external_attr)
            mode = info.external_attr >> 16
            if mode & 0o170000 == 0o120000:
                raise bad_request("SYMLINK_BLOCKED", f"Symlinks are not allowed: {name}")

            ext = posixpath.splitext(norm)[1].lower()

            if ext in _BLOCKED_EXT:
                raise bad_request("BLOCKED_FILE_TYPE", f"File type not allowed in submissions: {name}")

            if ext in _ARCHIVE_EXT:
                if depth >= settings.MAX_ZIP_DEPTH:
                    raise bad_request(
                        "NESTED_ARCHIVE", f"Nested archives beyond depth {settings.MAX_ZIP_DEPTH} are not allowed."
                    )
                # Read + recurse (still counts toward totals) but do not keep the archive itself.
                with zf.open(info) as fh:
                    nested_bytes = _read_limited(fh, settings.MAX_UNCOMPRESSED_SIZE - total_uncompressed)
                total_uncompressed += len(nested_bytes)
                nested = safe_extract(nested_bytes, depth=depth + 1)
                for nf in nested.files:
                    nf.path = posixpath.join(posixpath.dirname(norm), nf.path)
                    files.append(nf)
                total_uncompressed += nested.total_uncompressed
                continue

            with zf.open(info) as fh:
                payload = _read_limited(fh, settings.MAX_UNCOMPRESSED_SIZE - total_uncompressed)

            total_uncompressed += len(payload)
            if total_uncompressed > settings.MAX_UNCOMPRESSED_SIZE:
                raise bad_request("UNCOMPRESSED_TOO_LARGE", "Extracted content exceeds the size limit.")

            is_text = ext in _TEXT_EXT
            files.append(
                ExtractedFile(
                    path=norm,
                    filename=posixpath.basename(norm),
                    extension=ext,
                    size_bytes=len(payload),
                    mime_type=mimetypes.guess_type(norm)[0] or ("text/plain" if is_text else "application/octet-stream"),
                    sha256=hashlib.sha256(payload).hexdigest(),
                    is_text=is_text,
                    data=payload,
                )
            )

    if not files:
        raise bad_request("EMPTY_ARCHIVE", "The archive contains no extractable files.")

    return ExtractionResult(files=files, total_uncompressed=total_uncompressed, archive_sha256=archive_sha)


def _read_limited(fh, remaining: int) -> bytes:
    if remaining <= 0:
        raise bad_request("UNCOMPRESSED_TOO_LARGE", "Extracted content exceeds the size limit.")
    chunk = fh.read(remaining + 1)
    if len(chunk) > remaining:
        raise bad_request("UNCOMPRESSED_TOO_LARGE", "Extracted content exceeds the size limit.")
    return chunk


def decode_text(f: ExtractedFile) -> str:
    try:
        return f.data.decode("utf-8")
    except UnicodeDecodeError:
        return f.data.decode("latin-1", errors="replace")
