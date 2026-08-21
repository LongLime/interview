"""Fix resume foreign-key on-delete rules to match ORM semantics.

Revision ID: 20260816_02
Revises: 20260809_01
Create Date: 2026-08-16
"""

from alembic import op

revision = "20260816_02"
down_revision = "20260809_01"
branch_labels = None
depends_on = None


def _drop_fk(table: str, column: str) -> None:
    op.execute(
        f"""
        DO $$
        DECLARE fk_name text;
        BEGIN
            SELECT conname INTO fk_name
            FROM pg_constraint
            WHERE contype = 'f'
              AND conrelid = '{table}'::regclass
              AND strpos(pg_get_constraintdef(oid), '({column})') > 0;
            IF fk_name IS NOT NULL THEN
                EXECUTE format('ALTER TABLE {table} DROP CONSTRAINT %I', fk_name);
            END IF;
        END $$
        """
    )


def upgrade() -> None:
    # interview_sessions.resume_id: ORM 声明 ondelete="SET NULL"，删除简历时保留面试记录
    _drop_fk("interview_sessions", "resume_id")
    op.execute(
        "ALTER TABLE interview_sessions "
        "ADD CONSTRAINT interview_sessions_resume_id_fkey "
        "FOREIGN KEY (resume_id) REFERENCES resumes(id) ON DELETE SET NULL"
    )

    # resume_analyses.resume_id: ORM 声明 ondelete="CASCADE"，删除简历时级联删除分析记录
    _drop_fk("resume_analyses", "resume_id")
    op.execute(
        "ALTER TABLE resume_analyses "
        "ADD CONSTRAINT resume_analyses_resume_id_fkey "
        "FOREIGN KEY (resume_id) REFERENCES resumes(id) ON DELETE CASCADE"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE interview_sessions DROP CONSTRAINT interview_sessions_resume_id_fkey")
    op.execute(
        "ALTER TABLE interview_sessions "
        "ADD CONSTRAINT interview_sessions_resume_id_fkey "
        "FOREIGN KEY (resume_id) REFERENCES resumes(id)"
    )
    op.execute("ALTER TABLE resume_analyses DROP CONSTRAINT resume_analyses_resume_id_fkey")
    op.execute(
        "ALTER TABLE resume_analyses "
        "ADD CONSTRAINT resume_analyses_resume_id_fkey "
        "FOREIGN KEY (resume_id) REFERENCES resumes(id)"
    )
