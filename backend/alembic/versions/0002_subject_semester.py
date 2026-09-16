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
    with op.batch_alter_table("subjects") as batch:
        batch.add_column(sa.Column("semester", sa.String(length=40), nullable=False, server_default=""))


def downgrade() -> None:
    with op.batch_alter_table("subjects") as batch:
        batch.drop_column("semester")
