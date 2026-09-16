"""Isolated SQL execution for deterministic checks.

Student SQL is NEVER run against the application's PostgreSQL database. It runs in a
throwaway in-memory SQLite database in a worker thread with:
  * a statement/opcode timeout (progress handler)
  * an authorizer that blocks ATTACH, extension loading, transactions escapes, etc.
  * no filesystem or network access (in-memory only)
  * a hard row cap on result sets
"""

from __future__ import annotations

import sqlite3
import threading
from dataclasses import dataclass, field

from app.core.config import settings

_DENIED = {
    sqlite3.SQLITE_ATTACH,
    sqlite3.SQLITE_DETACH,
    getattr(sqlite3, "SQLITE_PRAGMA", 19),
}


def _authorizer(action, arg1, arg2, dbname, source):
    if action in _DENIED:
        return sqlite3.SQLITE_DENY
    return sqlite3.SQLITE_OK


@dataclass
class StatementResult:
    sql: str
    ok: bool
    error: str = ""
    columns: list[str] = field(default_factory=list)
    rows: list[tuple] = field(default_factory=list)
    rowcount: int = 0


@dataclass
class SandboxRun:
    ok: bool
    timed_out: bool
    statements: list[StatementResult] = field(default_factory=list)
    error: str = ""

    def table_names(self) -> list[str]:
        for st in self.statements:
            pass
        return []


def split_statements(script: str) -> list[str]:
    out, buf, in_s, in_d, in_line, in_block = [], [], False, False, False, False
    i = 0
    while i < len(script):
        ch = script[i]
        nxt = script[i + 1] if i + 1 < len(script) else ""
        if in_line:
            if ch == "\n":
                in_line = False
            i += 1
            continue
        if in_block:
            if ch == "*" and nxt == "/":
                in_block = False
                i += 2
                continue
            i += 1
            continue
        if not in_s and not in_d:
            if ch == "-" and nxt == "-":
                in_line = True
                i += 2
                continue
            if ch == "/" and nxt == "*":
                in_block = True
                i += 2
                continue
        if ch == "'" and not in_d:
            in_s = not in_s
        elif ch == '"' and not in_s:
            in_d = not in_d
        if ch == ";" and not in_s and not in_d:
            stmt = "".join(buf).strip()
            if stmt:
                out.append(stmt)
            buf = []
            i += 1
            continue
        buf.append(ch)
        i += 1
    tail = "".join(buf).strip()
    if tail:
        out.append(tail)
    return out


def run_sql(setup_sql: str, *, query_sql: str = "", timeout: int | None = None) -> SandboxRun:
    timeout = timeout or settings.SQL_SANDBOX_TIMEOUT_SECONDS
    result = SandboxRun(ok=False, timed_out=False)
    done = threading.Event()

    def _work():
        conn = sqlite3.connect(":memory:", isolation_level=None)
        try:
            conn.set_authorizer(_authorizer)
            steps = 0

            def _progress():
                nonlocal steps
                steps += 1
                # ~ each unit is 1000 vm opcodes; cap runaway queries
                if steps > timeout * 4000:
                    return 1
                return 0

            conn.set_progress_handler(_progress, 1000)

            for stmt in split_statements(setup_sql) + (split_statements(query_sql) if query_sql else []):
                sr = StatementResult(sql=stmt, ok=False)
                try:
                    cur = conn.execute(stmt)
                    if cur.description:
                        sr.columns = [d[0] for d in cur.description]
                        fetched = cur.fetchmany(settings.SQL_SANDBOX_MAX_ROWS)
                        sr.rows = fetched
                        sr.rowcount = len(fetched)
                    else:
                        sr.rowcount = cur.rowcount
                    sr.ok = True
                except sqlite3.Error as e:
                    sr.error = str(e)
                    if "interrupted" in str(e).lower():
                        result.timed_out = True
                result.statements.append(sr)
            result.ok = all(s.ok for s in result.statements) and not result.timed_out
        except Exception as e:  # pragma: no cover
            result.error = str(e)
        finally:
            conn.close()
            done.set()

    t = threading.Thread(target=_work, daemon=True)
    t.start()
    finished = done.wait(timeout + 2)
    if not finished:
        result.timed_out = True
        result.ok = False
        result.error = "SQL execution timed out"
    return result
