"""Add gaps_json column to match_results.

Revision ID: 20260826_04
Revises: 20260817_03
Create Date: 2026-08-26
"""

import sqlalchemy as sa

from alembic import op

revision = "20260826_04"
down_revision = "20260817_03"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("match_results") as batch:
        batch.add_column(sa.Column("gaps_json", sa.JSON(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("match_results") as batch:
        batch.drop_column("gaps_json")
