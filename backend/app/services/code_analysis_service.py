"""Deterministic (non-AI) checks. Ground truth for the hybrid evaluator."""

from __future__ import annotations

import re
from dataclasses import asdict, dataclass, field

from app.services.sql_sandbox import run_sql, split_statements


@dataclass
class DeterministicCheck:
    code: str
    name: str
    category: str
    description: str
    expected: str
    actual: str
    passed: bool
    score: float
    max_score: float
    explanation: str
    evidence: list[str] = field(default_factory=list)

    def dict(self) -> dict:
        return asdict(self)


_CREATE_TABLE = re.compile(r"create\s+table\s+(?:if\s+not\s+exists\s+)?[\"'`]?(\w+)", re.I)
_PK = re.compile(r"primary\s+key", re.I)
_FK = re.compile(r"(foreign\s+key|references\s+\w+)", re.I)
_JOIN = re.compile(r"\bjoin\b", re.I)
_GROUP_BY = re.compile(r"group\s+by", re.I)
_AGG = re.compile(r"\b(count|sum|avg|min|max)\s*\(", re.I)


def analyse_sql_submission(
    *, files: dict[str, str], required_files: list[str], expected_min_tables: int = 3
) -> list[DeterministicCheck]:
    checks: list[DeterministicCheck] = []
    lower_names = {name.lower(): name for name in files}

    # --- TC: required file structure ---
    missing = [r for r in required_files if r.lower() not in lower_names]
    checks.append(
        DeterministicCheck(
            code="TC-001",
            name="Required file structure",
            category="deterministic",
            description="All required files are present at the archive root.",
            expected=f"present: {', '.join(required_files)}",
            actual="missing: " + (", ".join(missing) if missing else "none"),
            passed=not missing,
            score=6.0 if not missing else max(0.0, 6.0 - 2 * len(missing)),
            max_score=6.0,
            explanation="Every expected file was located." if not missing else f"Missing: {', '.join(missing)}.",
            evidence=[f"archive files: {', '.join(files)}"],
        )
    )

    schema_sql = _first(files, ("schema.sql", "solution.sql", "queries.sql"))
    all_sql = "\n".join(v for k, v in files.items() if k.lower().endswith(".sql"))

    # --- TC: SQL syntax / executes ---
    setup = schema_sql or all_sql
    run = run_sql(setup)
    syntax_errors = [s.error for s in run.statements if not s.ok]
    checks.append(
        DeterministicCheck(
            code="TC-002",
            name="SQL executes without errors",
            category="deterministic",
            description="All DDL/DML statements run in an isolated SQL engine.",
            expected="0 execution errors",
            actual=f"{len(syntax_errors)} error(s)" + (f": {syntax_errors[0]}" if syntax_errors else ""),
            passed=run.ok,
            score=10.0 if run.ok else max(0.0, 10.0 - 2.5 * len(syntax_errors)),
            max_score=10.0,
            explanation="The isolated engine accepted every statement." if run.ok else "One or more statements failed to execute.",
            evidence=[f"statements executed: {len(run.statements)}"],
        )
    )

    # --- TC: schema / tables created ---
    declared_tables = _CREATE_TABLE.findall(setup)
    created_tables = _tables_after_run(setup)
    checks.append(
        DeterministicCheck(
            code="TC-003",
            name="Database schema",
            category="deterministic",
            description=f"At least {expected_min_tables} tables are created for the scenario entities.",
            expected=f">= {expected_min_tables} tables",
            actual=f"{len(created_tables)} tables: {', '.join(sorted(created_tables)) or 'none'}",
            passed=len(created_tables) >= expected_min_tables,
            score=12.0 if len(created_tables) >= expected_min_tables else 12.0 * len(created_tables) / max(expected_min_tables, 1),
            max_score=12.0,
            explanation="Schema models the scenario entities." if created_tables else "No tables were created.",
            evidence=[f"declared in DDL: {', '.join(declared_tables) or 'none'}"],
        )
    )

    # --- TC: primary keys ---
    pk_count = len(_PK.findall(setup))
    checks.append(
        _bool_check(
            "TC-004", "Primary keys declared", "Every table declares a primary key.",
            expected="1 PK per table", actual=f"{pk_count} PRIMARY KEY clause(s)",
            passed=pk_count >= max(1, len(created_tables)), score_max=6.0,
            ok_expl="Primary keys are declared across the schema.",
            bad_expl="One or more tables are missing a primary key.",
        )
    )

    # --- TC: foreign keys ---
    fk_count = len(_FK.findall(setup))
    checks.append(
        _bool_check(
            "TC-005", "Foreign keys declared", "Relationships are enforced with foreign keys.",
            expected=">= 1 FK", actual=f"{fk_count} foreign-key reference(s)",
            passed=fk_count >= 1, score_max=6.0,
            ok_expl="Foreign keys connect the related entities.",
            bad_expl="No foreign key relationships were found.",
        )
    )

    # --- TC: JOIN queries ---
    join_count = len(_JOIN.findall(all_sql))
    checks.append(
        _bool_check(
            "TC-006", "JOIN query correctness", "Submission contains multi-table JOIN queries that execute.",
            expected=">= 2 JOINs", actual=f"{join_count} JOIN keyword(s)",
            passed=join_count >= 2 and run.ok, score_max=10.0,
            ok_expl="JOIN queries are present and the script executes.",
            bad_expl="Fewer than two working JOIN queries were found.",
        )
    )

    # --- TC: aggregate query ---
    agg_ok = bool(_AGG.search(all_sql)) and bool(_GROUP_BY.search(all_sql))
    checks.append(
        _bool_check(
            "TC-007", "Aggregate query correctness", "Submission contains an aggregate with GROUP BY.",
            expected="aggregate + GROUP BY", actual=f"aggregate={bool(_AGG.search(all_sql))}, group_by={bool(_GROUP_BY.search(all_sql))}",
            passed=agg_ok, score_max=8.0,
            ok_expl="An aggregate query with grouping is present.",
            bad_expl="No aggregate query with GROUP BY was found.",
        )
    )

    # --- TC: normalization heuristic (honest: heuristic, not a proof) ---
    norm_flags = _normalization_smells(setup)
    checks.append(
        DeterministicCheck(
            code="TC-008",
            name="Normalization (heuristic)",
            category="deterministic",
            description="Heuristic scan for repeating groups / obvious transitive dependencies. Not a formal proof.",
            expected="no obvious 1NF/2NF/3NF smells",
            actual=f"{len(norm_flags)} smell(s)",
            passed=len(norm_flags) == 0,
            score=12.0 if not norm_flags else max(2.0, 12.0 - 3 * len(norm_flags)),
            max_score=12.0,
            explanation="No obvious normalization smells detected." if not norm_flags else "Possible normalization issues: " + "; ".join(norm_flags),
            evidence=norm_flags or ["columns per table within expected range"],
        )
    )

    return checks


def analyse_generic_submission(*, files: dict[str, str], required_files: list[str]) -> list[DeterministicCheck]:
    lower = {k.lower() for k in files}
    missing = [r for r in required_files if r.lower() not in lower]
    return [
        DeterministicCheck(
            code="TC-001", name="Required file structure", category="deterministic",
            description="All required files are present.",
            expected=", ".join(required_files), actual="missing: " + (", ".join(missing) or "none"),
            passed=not missing, score=10.0 if not missing else 0.0, max_score=10.0,
            explanation="All required files present." if not missing else f"Missing: {', '.join(missing)}",
        ),
        DeterministicCheck(
            code="TC-002", name="Non-empty content", category="deterministic",
            description="Submitted files contain content.",
            expected="all files non-empty", actual=f"{sum(1 for v in files.values() if v.strip())}/{len(files)} non-empty",
            passed=all(v.strip() for v in files.values()), score=5.0 if all(v.strip() for v in files.values()) else 0.0,
            max_score=5.0, explanation="Files contain content.",
        ),
    ]


# --------------------------------------------------------------------------- #
def _first(files: dict[str, str], names: tuple[str, ...]) -> str:
    lower = {k.lower(): v for k, v in files.items()}
    for n in names:
        if n in lower:
            return lower[n]
    return ""


def _tables_after_run(setup_sql: str) -> set[str]:
    run = run_sql(setup_sql, query_sql="SELECT name FROM sqlite_master WHERE type='table';")
    for st in reversed(run.statements):
        if st.columns == ["name"]:
            return {r[0] for r in st.rows}
    return set(_CREATE_TABLE.findall(setup_sql))


def _bool_check(code, name, desc, *, expected, actual, passed, score_max, ok_expl, bad_expl) -> DeterministicCheck:
    return DeterministicCheck(
        code=code, name=name, category="deterministic", description=desc,
        expected=expected, actual=actual, passed=passed,
        score=score_max if passed else 0.0, max_score=score_max,
        explanation=ok_expl if passed else bad_expl,
    )


def _normalization_smells(sql: str) -> list[str]:
    smells: list[str] = []
    for stmt in split_statements(sql):
        m = _CREATE_TABLE.search(stmt)
        if not m:
            continue
        table = m.group(1)
        body = stmt[stmt.find("(") + 1 : stmt.rfind(")")]
        cols = [c.strip().split()[0].strip('"`') for c in re.split(r",(?![^()]*\))", body) if c.strip()]
        # repeating groups: col1, col2, col3 ...
        numbered = [c for c in cols if re.search(r"\d$", c)]
        if len(numbered) >= 2:
            smells.append(f"{table}: numbered columns {numbered} suggest a repeating group (violates 1NF)")
        # transitive dependency smell: *_name alongside *_id for the same prefix
        ids = {c[:-3] for c in cols if c.endswith("_id")}
        names = {c[:-5] for c in cols if c.endswith("_name")}
        shared = (ids & names) - {table}
        for s in shared:
            smells.append(f"{table}: has both {s}_id and {s}_name (possible transitive dependency, violates 3NF)")
    return smells
