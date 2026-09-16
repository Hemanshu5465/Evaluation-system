"""Make a timestamped copy of the SQLite database.

    python -m scripts.backup_db            # -> backend/backups/evalai-YYYYMMDD-HHMMSS.db
    python -m scripts.backup_db restore    # restore the most recent backup (asks first)

Your live data lives in backend/evalai.db. This never touches it except on
`restore`, and even then it copies the current file aside first.
"""

from __future__ import annotations

import shutil
import sqlite3
import sys
from datetime import datetime
from pathlib import Path

from app.core.config import settings

DB = Path(settings.DATABASE_URL.replace("sqlite:///", ""))
BACKUPS = DB.parent / "backups"


def _snapshot(dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    # sqlite backup API flushes the WAL and produces a consistent copy
    src = sqlite3.connect(DB)
    dst = sqlite3.connect(dest)
    with dst:
        src.backup(dst)
    src.close()
    dst.close()


def main() -> int:
    if not DB.exists():
        print(f"No database at {DB} yet — nothing to back up.")
        return 1

    if len(sys.argv) > 1 and sys.argv[1] == "restore":
        picks = sorted(BACKUPS.glob("evalai-*.db"))
        if not picks:
            print(f"No backups found in {BACKUPS}")
            return 1
        latest = picks[-1]
        ans = input(f"Restore {latest.name} over {DB.name}? current file is copied aside first [y/N] ")
        if ans.strip().lower() != "y":
            print("Cancelled.")
            return 0
        _snapshot(DB.with_suffix(f".pre-restore-{datetime.now():%Y%m%d-%H%M%S}.db"))
        shutil.copy2(latest, DB)
        for ext in ("-wal", "-shm"):
            p = DB.with_name(DB.name + ext)
            if p.exists():
                p.unlink()
        print(f"Restored {latest.name}.")
        return 0

    dest = BACKUPS / f"evalai-{datetime.now():%Y%m%d-%H%M%S}.db"
    _snapshot(dest)
    print(f"Backed up to {dest}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
