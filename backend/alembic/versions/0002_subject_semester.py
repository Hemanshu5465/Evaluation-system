"""add subjects.semester

Revision ID: 0002_subject_semester
Revises: 0001_initial
Create Date: 2026-09-02
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0002_subject_semester"
down_revision: Union[str, None] = "0001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 0001_initial materialises the schema from *current* models (see its docstring),
    # so on a brand-new database it already includes columns later migrations also
    # add — guard with a column-existence check so this stays a no-op there instead
    # of failing with DuplicateColumn.
    bind = op.get_bind()
    existing = {c["name"] for c in sa.inspect(bind).get_columns("subjects")}
    if "semester" not in existing:
        with op.batch_alter_table("subjects") as batch:
            batch.add_column(sa.Column("semester", sa.String(length=40), nullable=False, server_default=""))


def downgrade() -> None:
    with op.batch_alter_table("subjects") as batch:
        batch.drop_column("semester")
