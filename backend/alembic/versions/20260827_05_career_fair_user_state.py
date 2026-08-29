"""Add per-user recruitment activity state.

Revision ID: 20260827_05
Revises: 20260826_04
Create Date: 2026-08-27
"""

import sqlalchemy as sa

from alembic import op

revision = "20260827_05"
down_revision = "20260826_04"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "career_fair_user_state",
        sa.Column("id", sa.BigInteger(), nullable=False),
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("career_fair_id", sa.BigInteger(), nullable=False),
        sa.Column("is_favorited", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("is_scheduled", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["career_fair_id"], ["career_fair.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["app_user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "career_fair_id"),
    )


def downgrade() -> None:
    op.drop_table("career_fair_user_state")