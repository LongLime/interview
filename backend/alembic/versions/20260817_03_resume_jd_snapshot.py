"""Store resume analysis mode and custom JD snapshots.

Revision ID: 20260817_03
Revises: 20260816_02
Create Date: 2026-08-17
"""

import sqlalchemy as sa

from alembic import op

revision = "20260817_03"
down_revision = "20260816_02"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("resume_analyses") as batch:
        batch.add_column(
            sa.Column(
                "analysis_mode",
                sa.String(length=32),
                nullable=False,
                server_default="GENERAL",
            )
        )
        batch.add_column(sa.Column("job_title", sa.String(length=255), nullable=True))
        batch.add_column(sa.Column("company_name", sa.String(length=255), nullable=True))
        batch.add_column(sa.Column("jd_text", sa.Text(), nullable=True))
        batch.add_column(sa.Column("job_match_result_json", sa.JSON(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("resume_analyses") as batch:
        columns = (
            "job_match_result_json",
            "jd_text",
            "company_name",
            "job_title",
            "analysis_mode",
        )
        for column in columns:
            batch.drop_column(column)
