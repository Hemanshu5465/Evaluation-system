from __future__ import annotations

import io
import zipfile

import pytest

from app.core.errors import AppError
from app.services.zip_service import safe_extract


def _zip(entries, compression=zipfile.ZIP_DEFLATED):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", compression) as zf:
        for name, data in entries:
            zf.writestr(name, data)
    return buf.getvalue()


def test_valid_zip_extracts():
    data = _zip([("schema.sql", "SELECT 1;"), ("README.md", "# hi")])
    res = safe_extract(data)
    assert {f.filename for f in res.files} == {"schema.sql", "README.md"}


def test_path_traversal_blocked():
    data = _zip([("../../etc/passwd", "root:x:0:0")])
    with pytest.raises(AppError) as e:
        safe_extract(data)
    assert e.value.code in {"PATH_TRAVERSAL", "BAD_PATH"}


def test_absolute_path_blocked():
    data = _zip([("/etc/shadow", "x")])
    with pytest.raises(AppError) as e:
        safe_extract(data)
    assert e.value.code == "BAD_PATH"


def test_blocked_extension():
    data = _zip([("payload.exe", b"MZ\x90\x00")])
    with pytest.raises(AppError) as e:
        safe_extract(data)
    assert e.value.code == "BLOCKED_FILE_TYPE"


def test_too_many_files(monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "MAX_ZIP_FILES", 3)
    data = _zip([(f"f{i}.txt", "x") for i in range(10)])
    with pytest.raises(AppError) as e:
        safe_extract(data)
    assert e.value.code == "TOO_MANY_FILES"


def test_zip_bomb_ratio(monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "MAX_ZIP_RATIO", 5)
    data = _zip([("big.txt", "A" * 2_000_000)])  # compresses ~1000x
    with pytest.raises(AppError) as e:
        safe_extract(data)
    assert e.value.code in {"ZIP_BOMB", "UNCOMPRESSED_TOO_LARGE"}


def test_not_a_zip():
    with pytest.raises(AppError) as e:
        safe_extract(b"this is not a zip file")
    assert e.value.code == "INVALID_ZIP"
