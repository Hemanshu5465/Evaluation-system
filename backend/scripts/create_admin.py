"""Create the first admin account.

Usage:
    python -m scripts.create_admin
    python -m scripts.create_admin --email admin@school.edu --name "Dr. Admin"
Password is read from FIRST_ADMIN_PASSWORD or prompted interactively.
"""

from __future__ import annotations

import argparse
import getpass
import sys

from sqlalchemy import func, select

from app.core.config import settings
from app.core.database import session_scope
from app.core.security import hash_password
from app.models.enums import Role
from app.models.user import User


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--email", default=settings.FIRST_ADMIN_EMAIL)
    parser.add_argument("--name", default=settings.FIRST_ADMIN_NAME)
    args = parser.parse_args()

    password = settings.FIRST_ADMIN_PASSWORD or getpass.getpass("Admin password: ")
    if len(password) < 8:
        print("Password must be at least 8 characters.", file=sys.stderr)
        return 1

    with session_scope() as db:
        if db.scalar(select(User).where(func.lower(User.email) == args.email.lower())):
            print(f"User {args.email} already exists.")
            return 0
        db.add(
            User(
                name=args.name,
                email=args.email.lower(),
                password_hash=hash_password(password),
                role=Role.ADMIN,
                is_active=True,
            )
        )
    print(f"Created admin: {args.email}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
