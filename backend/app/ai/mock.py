"""Deterministic offline builders used when AI_PROVIDER=mock.

These are NOT random. Output is a pure function of the input hash so tests are
stable and results stay within rubric bounds. Real deployments set AI_PROVIDER
to anthropic/openai and this module is bypassed.
"""

from __future__ import annotations

import hashlib

_DOMAINS = [
    ("Hospital Management", "Healthcare",
     ["patient(patient_id PK, full_name, dob, phone)",
      "doctor(doctor_id PK, full_name, specialization, department_id FK)",
      "department(department_id PK, name, floor)",
      "appointment(appointment_id PK, patient_id FK, doctor_id FK, scheduled_at, status)"]),
    ("E-Commerce Marketplace", "Retail",
     ["customer(customer_id PK, full_name, email, joined_on)",
      "product(product_id PK, title, price, category, stock_qty)",
      "orders(order_id PK, customer_id FK, placed_at, status)",
      "order_item(order_id FK, product_id FK, quantity, unit_price)"]),
    ("City Library Network", "Public Services",
     ["member(member_id PK, full_name, email, membership_type)",
      "book(book_id PK, title, author, isbn, category)",
      "copy(copy_id PK, book_id FK, shelf_code, condition)",
      "loan(loan_id PK, copy_id FK, member_id FK, borrowed_on, due_on, returned_on)"]),
    ("Retail Bank Accounts", "Finance",
     ["customer(customer_id PK, full_name, kyc_status, phone)",
      "account(account_id PK, customer_id FK, branch_id FK, type, balance)",
      "branch(branch_id PK, name, ifsc, city)",
      "txn(txn_id PK, account_id FK, amount, direction, created_at)"]),
    ("University Course Registry", "Education",
     ["student(student_id PK, full_name, email, program)",
      "course(course_id PK, code, title, credits)",
      "section(section_id PK, course_id FK, instructor_id FK, term, capacity)",
      "enrolment(section_id FK, student_id FK, grade)"]),
    ("Airline Booking", "Travel",
     ["passenger(passenger_id PK, full_name, passport_no)",
      "flight(flight_id PK, flight_no, origin, destination, aircraft_id FK, departs_at)",
      "aircraft(aircraft_id PK, model, seat_count)",
      "booking(booking_id PK, flight_id FK, passenger_id FK, seat_no, fare)"]),
    ("Logistics Fleet", "Supply Chain",
     ["driver(driver_id PK, full_name, license_no)",
      "vehicle(vehicle_id PK, plate_no, capacity_kg, warehouse_id FK)",
      "warehouse(warehouse_id PK, name, city)",
      "shipment(shipment_id PK, vehicle_id FK, driver_id FK, weight_kg, dispatched_at, status)"]),
    ("Fitness Studio Chain", "Wellness",
     ["member(member_id PK, full_name, email, plan)",
      "studio(studio_id PK, name, city)",
      "class_session(session_id PK, studio_id FK, trainer_id FK, starts_at, capacity)",
      "attendance(session_id FK, member_id FK, checked_in_at)"]),
]


def _seed(*parts: str) -> int:
    h = hashlib.sha256("::".join(parts).encode()).hexdigest()
    return int(h[:12], 16)


def mock_question(*, subject_name: str, topics: list[str], difficulty: str, number_of_parts: int) -> dict:
    part_prompts = [
        ("Design the relational schema (tables, keys, relationships) for the assigned scenario.",
         "data modelling / ER design", 25),
        ("Write the required SQL: two filtered SELECT statements, two JOINs across 3+ tables, "
         "and one aggregate with GROUP BY / HAVING.", "SQL DML", 30),
        ("Identify and remove any normalization violation; explain the dependency you eliminated.",
         "normalization to 3NF", 25),
        ("Recommend an indexing strategy for the two most frequent queries and justify it.",
         "indexing & query optimization", 20),
        ("Discuss one transaction-isolation concern for this scenario and how you would address it.",
         "transactions & concurrency", 15),
    ]
    n = max(2, min(5, number_of_parts))
    chosen = part_prompts[:n]
    # normalise marks to 100
    total = sum(m for *_ , m in chosen)
    parts = []
    for i, (prompt, concept, marks) in enumerate(chosen, start=1):
        parts.append({
            "part_number": i,
            "prompt": prompt,
            "expected_concept": concept,
            "marks": round(marks * 100 / total),
        })
    return {
        "title": f"Question 01 — Scenario-Based {subject_name}",
        "common_prompt": (
            "Design a relational database solution for the given business scenario and implement "
            "the required SQL. Every student receives the same conceptual question and identical "
            "evaluation criteria — only the business scenario and sample data differ. Your schema "
            "must be normalized to at least 3NF and your queries must run against your own schema.sql."
        ),
        "parts": parts,
        "instructions": [
            "Work only from the scenario assigned to you.",
            "Submit a single .zip archive containing all required files.",
            "Document every assumption in README.md.",
        ],
        "constraints": [
            "Target dialect: standard SQL (SQLite-compatible for automated checks)",
            "Schema must satisfy at least 3NF",
            "All foreign keys must be explicitly declared",
        ],
        "expected_files": ["schema.sql", "queries.sql", "solution.sql", "README.md"],
        "learning_objectives": [
            f"Apply {', '.join(topics[:3]) or subject_name} to an unfamiliar business scenario",
            "Produce correct, normalized relational designs with justification",
            "Write correct and efficient SQL for retrieval and aggregation",
        ],
        "difficulty": difficulty,
        "evaluation_rubric": [
            {"key": "understanding", "name": "Understanding", "max_marks": 20},
            {"key": "implementation", "name": "Implementation", "max_marks": 25},
            {"key": "correctness", "name": "Correctness", "max_marks": 30},
            {"key": "code_quality", "name": "Code Quality", "max_marks": 15},
            {"key": "documentation", "name": "Documentation", "max_marks": 10},
        ],
    }


def mock_scenario(*, common_prompt: str, student_key: str, assessment_key: str) -> dict:
    idx = _seed(assessment_key, student_key) % len(_DOMAINS)
    title, domain, entities = _DOMAINS[idx]
    parsed = []
    for e in entities:
        name = e.split("(")[0].strip()
        cols = [c.strip() for c in e[e.find("(") + 1 : e.rfind(")")].split(",")]
        parsed.append({"name": name, "columns": cols})
    return {
        "title": f"{title} Scenario",
        "domain": domain,
        "scenario_text": (
            f"You are modelling a {domain.lower()} system: {title}. "
            f"The organization currently manages its records in spreadsheets and wants a proper "
            f"relational database. You are given roughly 30 sample rows per entity, some containing "
            f"deliberate redundancy for you to normalize. Core question: {common_prompt[:160]}..."
        ),
        "entities": parsed,
        "sample_records_note": f"{parsed[0]['name']}: 32 rows; " + ", ".join(p["name"] for p in parsed),
        "variables": {"domain": domain, "entity_count": len(parsed)},
    }


def mock_answer_eval(*, rubric: list[dict], deterministic_pass_ratio: float, submission_digest: str) -> dict:
    s = _seed(submission_digest)
    base = 0.70 + (s % 20) / 100  # 0.70 - 0.89, stable per submission
    quality = min(1.0, 0.5 * base + 0.5 * deterministic_pass_ratio)
    scores = []
    for c in rubric:
        frac = max(0.4, min(1.0, quality + ((s >> (len(scores) + 1)) % 7 - 3) / 100))
        scores.append({
            "key": c["key"],
            "name": c["name"],
            "score": round(c["max_marks"] * frac, 1),
            "max_score": float(c["max_marks"]),
            "evidence": [f"{c['name']}: {round(frac * 100)}% of criteria met based on submitted files and test results"],
        })
    return {
        "rubric_scores": scores,
        "strengths": [
            "Schema design models the scenario entities with appropriate keys",
            "Most required SQL statements are logically correct",
            "Integrity constraints applied on primary and foreign keys",
        ],
        "weaknesses": [
            "At least one normalization requirement is not fully satisfied",
            "Edge-case handling for empty result sets is incomplete",
            "README is light on design justification",
        ],
        "recommendations": [
            "Decompose the transitively dependent attribute into its own relation to reach 3NF",
            "Wrap aggregates to avoid NULL propagation on empty inputs",
            "Expand README.md with schema and indexing rationale",
        ],
        "explanation": (
            "The submission implements the schema and the majority of required queries correctly, "
            "with sound use of joins and constraints. The main weakness is an unresolved normalization "
            "issue that slightly skews one aggregate result. Documentation is adequate but thin."
        ),
        "confidence": round(0.80 + (s % 15) / 100, 2),
        "ai_content_probability": round(0.10 + (s % 25) / 100, 2),
        "ai_content_classification": "LOW" if (s % 25) < 20 else "MODERATE",
        "ai_content_evidence": ["Stylistic variation and scenario-specific detail consistent with human authorship"],
    }


def mock_ai_content(*, text: str) -> dict:
    s = _seed(text[:2000])
    prob = round(0.10 + (s % 30) / 100, 2)  # 0.10 - 0.39
    cls = "LOW" if prob < 0.30 else "MODERATE"
    return {
        "estimated_probability": prob,
        "classification": cls,
        "confidence": round(0.65 + (s % 20) / 100, 2),
        "evidence": [
            "Sentence-length variance within normal human range" if prob < 0.3
            else "Some passages show unusually uniform structure",
            "Domain-specific terminology used consistently",
            "Comment style matches typical student submissions",
        ],
    }


def mock_project_eval(*, rubric: list[dict], inventory: list[str], has_readme: bool, has_db: bool, digest: str) -> dict:
    s = _seed(digest)
    base = 0.75 + (s % 15) / 100
    scores = []
    for c in rubric:
        frac = max(0.5, min(1.0, base + ((s >> (len(scores) + 1)) % 5 - 2) / 100))
        scores.append({
            "key": c["key"], "name": c["name"],
            "score": round(c["max_marks"] * frac, 1), "max_score": float(c["max_marks"]),
            "evidence": [f"{c['name']} assessed from {len(inventory)} files in the archive"],
        })
    return {
        "rubric_scores": scores,
        "checks": [
            {"name": "Project structure", "passed": True, "detail": "Conventional src/ and public/ layout with a clear entry point."},
            {"name": "README present", "passed": has_readme, "detail": "README.md covers setup and scripts." if has_readme else "README.md missing."},
            {"name": "Documentation quality", "passed": s % 2 == 0, "detail": "Documentation present but light on API contracts."},
            {"name": "Database script", "passed": has_db, "detail": "database.sql creates tables with keys." if has_db else "No database script found."},
            {"name": "Dependencies", "passed": True, "detail": "Manifest is well-formed; no abandoned packages flagged."},
            {"name": "Security issues", "passed": s % 3 != 0, "detail": "One endpoint interpolates a query parameter into SQL — parameterise it." if s % 3 == 0 else "No obvious injection points found."},
            {"name": "Requirements coverage", "passed": True, "detail": "Core features implemented end to end."},
        ],
        "strengths": ["Clean, conventional architecture", "Complete database layer", "Core features implemented"],
        "weaknesses": ["Documentation lacks data-flow detail", "A few overly long functions in one module"],
        "recommendations": ["Parameterise every SQL query", "Expand documentation with endpoint contracts", "Refactor long functions"],
        "explanation": (
            "A well-structured, feature-complete project with a solid database layer. Documentation depth "
            "and a small number of code-quality issues are the main things holding the score back."
        ),
        "confidence": round(0.80 + (s % 12) / 100, 2),
        "ai_content_probability": round(0.12 + (s % 22) / 100, 2),
        "ai_content_classification": "LOW" if (s % 22) < 18 else "MODERATE",
        "ai_content_evidence": ["Commit-style comments and project-specific naming consistent with human authorship"],
    }
