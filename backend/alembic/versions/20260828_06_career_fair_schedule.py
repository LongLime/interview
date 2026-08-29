"""Add recruitment activity schedules.

Revision ID: 20260828_06
Revises: 20260827_05
Create Date: 2026-08-28
"""

import sqlalchemy as sa

from alembic import op

revision = "20260828_06"
down_revision = "20260827_05"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "career_fair_schedule",
        sa.Column("id", sa.BigInteger(), nullable=False),
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("career_fair_id", sa.BigInteger(), nullable=True),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("start_time", sa.DateTime(), nullable=False),
        sa.Column("end_time", sa.DateTime(), nullable=True),
        sa.Column("location", sa.String(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("remind_minutes", sa.Integer(), nullable=True, server_default="60"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["career_fair_id"], ["career_fair.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["app_user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "career_fair_id"),
    )


def downgrade() -> None:
    op.drop_table("career_fair_schedule")