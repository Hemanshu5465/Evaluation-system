"""add per-question timer: assessments.duration_minutes, assessment_students.started_at

Revision ID: 0003_assessment_timer
Revises: 0002_subject_semester
Create Date: 2026-09-13
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0003_assessment_timer"
down_revision: Union[str, None] = "0002_subject_semester"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("assessments") as batch:
        batch.add_column(sa.Column("duration_minutes", sa.Integer(), nullable=True))
    with op.batch_alter_table("assessment_students") as batch:
        batch.add_column(sa.Column("started_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("assessment_students") as batch:
        batch.drop_column("started_at")
    with op.batch_alter_table("assessments") as batch:
        batch.drop_column("duration_minutes")
