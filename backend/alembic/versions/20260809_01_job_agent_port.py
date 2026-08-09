"""Add complete resume analysis metadata and deterministic job matching tables.

Revision ID: 20260809_01
Revises:
Create Date: 2026-08-09
"""

import sqlalchemy as sa

from alembic import op

revision = "20260809_01"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Existing production deployments already have resume_analyses. Nullable additions preserve
    # every legacy row and allow mixed-version rollback while application instances are draining.
    with op.batch_alter_table("resume_analyses") as batch:
        batch.add_column(sa.Column("full_result_json", sa.JSON(), nullable=True))
        batch.add_column(sa.Column("candidate_profile_json", sa.JSON(), nullable=True))
        batch.add_column(sa.Column("style_detection_json", sa.JSON(), nullable=True))
        batch.add_column(sa.Column("grade", sa.String(length=8), nullable=True))
        batch.add_column(sa.Column("provider", sa.String(length=64), nullable=True))
        batch.add_column(sa.Column("model", sa.String(length=128), nullable=True))
        batch.add_column(sa.Column("analysis_version", sa.String(length=32), nullable=True))
        batch.add_column(sa.Column("prompt_tokens", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("completion_tokens", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("total_tokens", sa.Integer(), nullable=True))

    op.create_table(
        "job_targets",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("company", sa.String(length=255), nullable=True),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("jd_text", sa.Text(), nullable=False),
        sa.Column("location", sa.String(length=255), nullable=True),
        sa.Column("source_url", sa.String(length=1000), nullable=True),
        sa.Column("metadata_json", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "match_results",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("resume_id", sa.BigInteger(), nullable=False),
        sa.Column("job_target_id", sa.BigInteger(), nullable=True),
        sa.Column("company", sa.String(length=255), nullable=True),
        sa.Column("title", sa.String(length=255), nullable=True),
        sa.Column("jd_text", sa.Text(), nullable=False),
        sa.Column("screen_decisions_json", sa.JSON(), nullable=True),
        sa.Column("screen_score", sa.Integer(), nullable=True),
        sa.Column("hard_excluded", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("score", sa.Integer(), nullable=True),
        sa.Column("grade", sa.String(length=8), nullable=True),
        sa.Column("verdict", sa.String(length=64), nullable=True),
        sa.Column("annotations_json", sa.JSON(), nullable=True),
        sa.Column("interview_tips", sa.Text(), nullable=True),
        sa.Column("provider", sa.String(length=64), nullable=True),
        sa.Column("model", sa.String(length=128), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="PENDING"),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("prompt_tokens", sa.Integer(), nullable=True),
        sa.Column("completion_tokens", sa.Integer(), nullable=True),
        sa.Column("total_tokens", sa.Integer(), nullable=True),
        sa.Column(
            "match_version", sa.String(length=32), nullable=False, server_default="job-agent-v1"
        ),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["job_target_id"], ["job_targets.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["resume_id"], ["resumes.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("resume_id", "job_target_id"),
    )
    op.create_index("ix_match_results_resume_id", "match_results", ["resume_id"])
    op.create_index("ix_match_results_job_target_id", "match_results", ["job_target_id"])


def downgrade() -> None:
    op.drop_index("ix_match_results_job_target_id", table_name="match_results")
    op.drop_index("ix_match_results_resume_id", table_name="match_results")
    op.drop_table("match_results")
    op.drop_table("job_targets")
    with op.batch_alter_table("resume_analyses") as batch:
        for column in (
            "total_tokens",
            "completion_tokens",
            "prompt_tokens",
            "analysis_version",
            "model",
            "provider",
            "grade",
            "style_detection_json",
            "candidate_profile_json",
            "full_result_json",
        ):
            batch.drop_column(column)
