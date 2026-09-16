"""Local development seed data. DO NOT run against production.

Creates 1 admin and 3 evaluators (password `demo1234`). Idempotent by email.
Students come from the real roster — run `python -m scripts.import_students`.
Subjects / syllabi / questions are created by the admin in the app.

    python -m scripts.seed
"""

from __future__ import annotations

from sqlalchemy import func, select

from app.core.database import session_scope
from app.core.security import hash_password
from app.models.enums import Role
from app.models.user import User

PASSWORD = "demo1234"

USERS = [
    ("Dr. Anjali Mehta", "admin@example.com", Role.ADMIN, "Assessment Office"),
    ("Prof. Sameer Rao", "evaluator@example.com", Role.EVALUATOR, "Computer Science"),
    ("Dr. Kavita Nair", "kavita@example.com", Role.EVALUATOR, "Information Systems"),
    ("Prof. Deepak Iyer", "deepak@example.com", Role.EVALUATOR, "Software Engineering"),
]


def main() -> None:
    with session_scope() as db:
        for name, email, role, dept in USERS:
            if db.scalar(select(User).where(func.lower(User.email) == email)):
                continue
            db.add(
                User(
                    name=name,
                    email=email,
                    password_hash=hash_password(PASSWORD),
                    role=role,
                    department=dept if role == Role.EVALUATOR else None,
                    is_active=True,
                )
            )
    print("Seed complete — admin@example.com / evaluator@example.com  (password: demo1234)")
    print("Next: python -m scripts.import_students")


if __name__ == "__main__":
    main()
