from __future__ import annotations

from datetime import UTC, date, datetime, time

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    Column,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Table,
    Text,
    Time,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


PRIMARY_KEY_TYPE = BigInteger().with_variant(Integer, "sqlite")


def utc_now() -> datetime:
    """Return UTC as a naive datetime for the existing TIMESTAMP columns."""
    return datetime.now(UTC).replace(tzinfo=None)


class Timestamps:
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, onupdate=utc_now)


class AppUser(Base, Timestamps):
    __tablename__ = "app_user"
    id: Mapped[int] = mapped_column(PRIMARY_KEY_TYPE, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(50), unique=True)
    password_hash: Mapped[str] = mapped_column(String, nullable=False)
    nickname: Mapped[str | None] = mapped_column(String(100))
    role: Mapped[str] = mapped_column(String(20), default="USER")
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)


class Resume(Base):
    __tablename__ = "resumes"
    id: Mapped[int] = mapped_column(PRIMARY_KEY_TYPE, primary_key=True, autoincrement=True)
    file_hash: Mapped[str] = mapped_column(String(64), unique=True)
    original_filename: Mapped[str] = mapped_column(String, nullable=False)
    file_size: Mapped[int | None] = mapped_column(BigInteger)
    content_type: Mapped[str | None] = mapped_column(String)
    storage_key: Mapped[str | None] = mapped_column(String(500))
    storage_url: Mapped[str | None] = mapped_column(String(1000))
    resume_text: Mapped[str | None] = mapped_column(Text)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    last_accessed_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    access_count: Mapped[int] = mapped_column(Integer, default=1)
    analyze_status: Mapped[str] = mapped_column(String(20), default="PENDING")
    analyze_error: Mapped[str | None] = mapped_column(String(500))
    analyses: Mapped[list[ResumeAnalysis]] = relationship(cascade="all, delete-orphan")


class ResumeAnalysis(Base):
    __tablename__ = "resume_analyses"
    id: Mapped[int] = mapped_column(PRIMARY_KEY_TYPE, primary_key=True, autoincrement=True)
    resume_id: Mapped[int] = mapped_column(ForeignKey("resumes.id", ondelete="CASCADE"))
    overall_score: Mapped[int | None] = mapped_column(Integer)
    content_score: Mapped[int | None] = mapped_column(Integer)
    structure_score: Mapped[int | None] = mapped_column(Integer)
    skill_match_score: Mapped[int | None] = mapped_column(Integer)
    expression_score: Mapped[int | None] = mapped_column(Integer)
    project_score: Mapped[int | None] = mapped_column(Integer)
    summary: Mapped[str | None] = mapped_column(Text)
    strengths_json: Mapped[str | None] = mapped_column(Text)
    suggestions_json: Mapped[str | None] = mapped_column(Text)
    full_result_json: Mapped[dict | None] = mapped_column(JSON)
    candidate_profile_json: Mapped[dict | None] = mapped_column(JSON)
    style_detection_json: Mapped[dict | None] = mapped_column(JSON)
    grade: Mapped[str | None] = mapped_column(String(8))
    provider: Mapped[str | None] = mapped_column(String(64))
    model: Mapped[str | None] = mapped_column(String(128))
    analysis_version: Mapped[str | None] = mapped_column(String(32))
    prompt_tokens: Mapped[int | None] = mapped_column(Integer)
    completion_tokens: Mapped[int | None] = mapped_column(Integer)
    total_tokens: Mapped[int | None] = mapped_column(Integer)
    analysis_mode: Mapped[str] = mapped_column(String(32), default="GENERAL")
    job_title: Mapped[str | None] = mapped_column(String(255))
    company_name: Mapped[str | None] = mapped_column(String(255))
    jd_text: Mapped[str | None] = mapped_column(Text)
    job_match_result_json: Mapped[dict | None] = mapped_column(JSON)
    analyzed_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)


class JobTarget(Base, Timestamps):
    __tablename__ = "job_targets"
    id: Mapped[int] = mapped_column(PRIMARY_KEY_TYPE, primary_key=True, autoincrement=True)
    company: Mapped[str | None] = mapped_column(String(255))
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    jd_text: Mapped[str] = mapped_column(Text, nullable=False)
    location: Mapped[str | None] = mapped_column(String(255))
    source_url: Mapped[str | None] = mapped_column(String(1000))
    metadata_json: Mapped[dict | None] = mapped_column(JSON)


class MatchResult(Base):
    __tablename__ = "match_results"
    __table_args__ = (UniqueConstraint("resume_id", "job_target_id"),)
    id: Mapped[int] = mapped_column(PRIMARY_KEY_TYPE, primary_key=True, autoincrement=True)
    resume_id: Mapped[int] = mapped_column(ForeignKey("resumes.id", ondelete="CASCADE"))
    job_target_id: Mapped[int | None] = mapped_column(
        ForeignKey("job_targets.id", ondelete="CASCADE")
    )
    company: Mapped[str | None] = mapped_column(String(255))
    title: Mapped[str | None] = mapped_column(String(255))
    jd_text: Mapped[str] = mapped_column(Text, nullable=False)
    screen_decisions_json: Mapped[dict | None] = mapped_column(JSON)
    screen_score: Mapped[int | None] = mapped_column(Integer)
    hard_excluded: Mapped[bool] = mapped_column(Boolean, default=False)
    score: Mapped[int | None] = mapped_column(Integer)
    grade: Mapped[str | None] = mapped_column(String(8))
    verdict: Mapped[str | None] = mapped_column(String(64))
    annotations_json: Mapped[list | None] = mapped_column(JSON)
    interview_tips: Mapped[str | None] = mapped_column(Text)
    provider: Mapped[str | None] = mapped_column(String(64))
    model: Mapped[str | None] = mapped_column(String(128))
    status: Mapped[str] = mapped_column(String(32), default="PENDING")
    error: Mapped[str | None] = mapped_column(Text)
    prompt_tokens: Mapped[int | None] = mapped_column(Integer)
    completion_tokens: Mapped[int | None] = mapped_column(Integer)
    total_tokens: Mapped[int | None] = mapped_column(Integer)
    match_version: Mapped[str] = mapped_column(String(32), default="job-agent-v1")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, onupdate=utc_now)


class InterviewSession(Base):
    __tablename__ = "interview_sessions"
    id: Mapped[int] = mapped_column(PRIMARY_KEY_TYPE, primary_key=True, autoincrement=True)
    session_id: Mapped[str] = mapped_column(String(36), unique=True)
    skill_id: Mapped[str] = mapped_column(String(64), default="java-backend")
    difficulty: Mapped[str] = mapped_column(String(16), default="mid")
    resume_id: Mapped[int | None] = mapped_column(ForeignKey("resumes.id", ondelete="SET NULL"))
    total_questions: Mapped[int] = mapped_column(Integer)
    current_question_index: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(20), default="CREATED")
    questions_json: Mapped[str] = mapped_column(Text)
    overall_score: Mapped[int | None] = mapped_column(Integer)
    overall_feedback: Mapped[str | None] = mapped_column(Text)
    strengths_json: Mapped[str | None] = mapped_column(Text)
    improvements_json: Mapped[str | None] = mapped_column(Text)
    reference_answers_json: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime)
    evaluate_status: Mapped[str | None] = mapped_column(String(20))
    evaluate_error: Mapped[str | None] = mapped_column(String(500))
    llm_provider: Mapped[str] = mapped_column(String(50), default="dashscope")
    answers: Mapped[list[InterviewAnswer]] = relationship(cascade="all, delete-orphan")


class InterviewAnswer(Base):
    __tablename__ = "interview_answers"
    __table_args__ = (UniqueConstraint("session_id", "question_index"),)
    id: Mapped[int] = mapped_column(PRIMARY_KEY_TYPE, primary_key=True, autoincrement=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("interview_sessions.id", ondelete="CASCADE"))
    question_index: Mapped[int] = mapped_column(Integer)
    question: Mapped[str] = mapped_column(Text)
    category: Mapped[str | None] = mapped_column(String)
    user_answer: Mapped[str | None] = mapped_column(Text)
    score: Mapped[int | None] = mapped_column(Integer)
    feedback: Mapped[str | None] = mapped_column(Text)
    reference_answer: Mapped[str | None] = mapped_column(Text)
    key_points_json: Mapped[str | None] = mapped_column(Text)
    answered_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)


class InterviewSchedule(Base, Timestamps):
    __tablename__ = "interview_schedule"
    id: Mapped[int] = mapped_column(PRIMARY_KEY_TYPE, primary_key=True, autoincrement=True)
    company_name: Mapped[str] = mapped_column(String)
    position: Mapped[str] = mapped_column(String)
    interview_time: Mapped[datetime] = mapped_column(DateTime)
    interview_type: Mapped[str | None] = mapped_column(String)
    meeting_link: Mapped[str | None] = mapped_column(Text)
    round_number: Mapped[int] = mapped_column(Integer, default=1)
    interviewer: Mapped[str | None] = mapped_column(String)
    notes: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String, default="PENDING")


class KnowledgeBase(Base):
    __tablename__ = "knowledge_bases"
    id: Mapped[int] = mapped_column(PRIMARY_KEY_TYPE, primary_key=True, autoincrement=True)
    file_hash: Mapped[str] = mapped_column(String(64), unique=True)
    name: Mapped[str] = mapped_column(String)
    category: Mapped[str | None] = mapped_column(String(100))
    original_filename: Mapped[str] = mapped_column(String)
    file_size: Mapped[int | None] = mapped_column(BigInteger)
    content_type: Mapped[str | None] = mapped_column(String)
    storage_key: Mapped[str | None] = mapped_column(String(500))
    storage_url: Mapped[str | None] = mapped_column(String(1000))
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    last_accessed_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    access_count: Mapped[int] = mapped_column(Integer, default=1)
    question_count: Mapped[int] = mapped_column(Integer, default=0)
    vector_status: Mapped[str] = mapped_column(String(20), default="PENDING")
    vector_error: Mapped[str | None] = mapped_column(String(500))
    chunk_count: Mapped[int] = mapped_column(Integer, default=0)


rag_links = Table(
    "rag_session_knowledge_bases",
    Base.metadata,
    Column("session_id", ForeignKey("rag_chat_sessions.id", ondelete="CASCADE"), primary_key=True),
    Column(
        "knowledge_base_id", ForeignKey("knowledge_bases.id", ondelete="CASCADE"), primary_key=True
    ),
)


class RagChatSession(Base):
    __tablename__ = "rag_chat_sessions"
    id: Mapped[int] = mapped_column(PRIMARY_KEY_TYPE, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String)
    status: Mapped[str] = mapped_column(String(20), default="ACTIVE")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    message_count: Mapped[int] = mapped_column(Integer, default=0)
    is_pinned: Mapped[bool] = mapped_column(Boolean, default=False)
    knowledge_bases: Mapped[list[KnowledgeBase]] = relationship(secondary=rag_links)
    messages: Mapped[list[RagChatMessage]] = relationship(cascade="all, delete-orphan")


class RagChatMessage(Base):
    __tablename__ = "rag_chat_messages"
    id: Mapped[int] = mapped_column(PRIMARY_KEY_TYPE, primary_key=True, autoincrement=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("rag_chat_sessions.id", ondelete="CASCADE"))
    type: Mapped[str] = mapped_column(String(20))
    content: Mapped[str] = mapped_column(Text)
    message_order: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    completed: Mapped[bool] = mapped_column(Boolean, default=True)


class LlmProvider(Base, Timestamps):
    __tablename__ = "llm_provider_config"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    base_url: Mapped[str] = mapped_column(String(512))
    api_key_ciphertext: Mapped[str] = mapped_column(String(4096))
    api_key_nonce: Mapped[str] = mapped_column(String(64), default="plain")
    model: Mapped[str] = mapped_column(String(128))
    embedding_model: Mapped[str | None] = mapped_column(String(128))
    embedding_dimensions: Mapped[int | None] = mapped_column(Integer)
    supports_embedding: Mapped[bool] = mapped_column(Boolean, default=False)
    temperature: Mapped[float | None] = mapped_column(Float)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    builtin: Mapped[bool] = mapped_column(Boolean, default=False)


class LlmGlobalSetting(Base, Timestamps):
    __tablename__ = "llm_global_setting"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, default=1)
    default_chat_provider_id: Mapped[str] = mapped_column(String(64))
    default_embedding_provider_id: Mapped[str] = mapped_column(String(64))


class VoiceSession(Base, Timestamps):
    __tablename__ = "voice_interview_sessions"
    id: Mapped[int] = mapped_column(PRIMARY_KEY_TYPE, primary_key=True, autoincrement=True)
    user_id: Mapped[str | None] = mapped_column(String)
    role_type: Mapped[str] = mapped_column(String)
    skill_id: Mapped[str] = mapped_column(String(64), default="java-backend")
    difficulty: Mapped[str] = mapped_column(String(16), default="mid")
    custom_jd_text: Mapped[str | None] = mapped_column(Text)
    resume_id: Mapped[int | None] = mapped_column(BigInteger)
    intro_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    tech_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    project_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    hr_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    llm_provider: Mapped[str] = mapped_column(String(50), default="dashscope")
    current_phase: Mapped[str] = mapped_column(String, default="INTRO")
    status: Mapped[str] = mapped_column(String, default="IN_PROGRESS")
    planned_duration: Mapped[int] = mapped_column(Integer, default=30)
    actual_duration: Mapped[int | None] = mapped_column(Integer)
    start_time: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    end_time: Mapped[datetime | None] = mapped_column(DateTime)
    paused_at: Mapped[datetime | None] = mapped_column(DateTime)
    resumed_at: Mapped[datetime | None] = mapped_column(DateTime)
    evaluate_status: Mapped[str | None] = mapped_column(String)
    evaluate_error: Mapped[str | None] = mapped_column(String(500))


class VoiceMessage(Base):
    __tablename__ = "voice_interview_messages"
    id: Mapped[int] = mapped_column(PRIMARY_KEY_TYPE, primary_key=True, autoincrement=True)
    session_id: Mapped[int] = mapped_column(BigInteger)
    message_type: Mapped[str] = mapped_column(String)
    phase: Mapped[str | None] = mapped_column(String)
    user_recognized_text: Mapped[str | None] = mapped_column(Text)
    ai_generated_text: Mapped[str | None] = mapped_column(Text)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    sequence_num: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)


class VoiceEvaluation(Base):
    __tablename__ = "voice_interview_evaluations"
    id: Mapped[int] = mapped_column(PRIMARY_KEY_TYPE, primary_key=True, autoincrement=True)
    session_id: Mapped[int] = mapped_column(BigInteger, unique=True)
    overall_score: Mapped[int | None] = mapped_column(Integer)
    overall_feedback: Mapped[str | None] = mapped_column(Text)
    question_evaluations_json: Mapped[str | None] = mapped_column(Text)
    strengths_json: Mapped[str | None] = mapped_column(Text)
    improvements_json: Mapped[str | None] = mapped_column(Text)
    reference_answers_json: Mapped[str | None] = mapped_column(Text)
    interviewer_role: Mapped[str | None] = mapped_column(String)
    interview_date: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)


class CareerFair(Base, Timestamps):
    __tablename__ = "career_fair"
    id: Mapped[int] = mapped_column(PRIMARY_KEY_TYPE, primary_key=True, autoincrement=True)
    external_id: Mapped[str | None] = mapped_column(String, unique=True)
    title: Mapped[str] = mapped_column(String)
    company_name: Mapped[str | None] = mapped_column(String)
    university_name: Mapped[str | None] = mapped_column(String)
    venue: Mapped[str | None] = mapped_column(String)
    address: Mapped[str | None] = mapped_column(String)
    fair_date: Mapped[date | None] = mapped_column(Date)
    start_time: Mapped[time | None] = mapped_column(Time)
    end_time: Mapped[time | None] = mapped_column(Time)
    fair_type: Mapped[str | None] = mapped_column(String)
    industry: Mapped[str | None] = mapped_column(String)
    description: Mapped[str | None] = mapped_column(Text)
    requirements: Mapped[str | None] = mapped_column(Text)
    source_url: Mapped[str | None] = mapped_column(String)
    poster_url: Mapped[str | None] = mapped_column(String)
    contact_info: Mapped[str | None] = mapped_column(String)
    view_count: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class ScrapeTask(Base, Timestamps):
    __tablename__ = "scrape_task"
    id: Mapped[int] = mapped_column(PRIMARY_KEY_TYPE, primary_key=True, autoincrement=True)
    task_name: Mapped[str] = mapped_column(String)
    source_url: Mapped[str] = mapped_column(String)
    description: Mapped[str | None] = mapped_column(String)
    cron_expression: Mapped[str | None] = mapped_column(String)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    status: Mapped[str] = mapped_column(String, default="IDLE")
    last_run_time: Mapped[datetime | None] = mapped_column(DateTime)
    last_success_time: Mapped[datetime | None] = mapped_column(DateTime)
    last_record_count: Mapped[int] = mapped_column(Integer, default=0)
    total_run_count: Mapped[int] = mapped_column(Integer, default=0)
    fail_count: Mapped[int] = mapped_column(Integer, default=0)
    error_message: Mapped[str | None] = mapped_column(Text)


class ScrapeRecord(Base):
    __tablename__ = "scrape_record"
    id: Mapped[int] = mapped_column(PRIMARY_KEY_TYPE, primary_key=True, autoincrement=True)
    task_id: Mapped[int | None] = mapped_column(ForeignKey("scrape_task.id", ondelete="SET NULL"))
    source_url: Mapped[str | None] = mapped_column(String)
    record_count: Mapped[int] = mapped_column(Integer, default=0)
    new_count: Mapped[int] = mapped_column(Integer, default=0)
    update_count: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String, default="RUNNING")
    error_message: Mapped[str | None] = mapped_column(Text)
    duration_ms: Mapped[int | None] = mapped_column(BigInteger)
    started_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime)


class ContributionCompany(Base, Timestamps):
    __tablename__ = "contribution_company"
    id: Mapped[int] = mapped_column(PRIMARY_KEY_TYPE, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String, unique=True)
    short_name: Mapped[str | None] = mapped_column(String)
    tier: Mapped[str | None] = mapped_column(String)


class ContributionTopic(Base, Timestamps):
    __tablename__ = "contribution_topic"
    id: Mapped[int] = mapped_column(PRIMARY_KEY_TYPE, primary_key=True, autoincrement=True)
    topic_key: Mapped[str] = mapped_column(String, unique=True)
    topic_label: Mapped[str] = mapped_column(String)
    description: Mapped[str | None] = mapped_column(Text)
    question_count: Mapped[int] = mapped_column(Integer, default=0)
    contribution_count: Mapped[int] = mapped_column(Integer, default=0)


class Contribution(Base, Timestamps):
    __tablename__ = "contribution"
    id: Mapped[int] = mapped_column(PRIMARY_KEY_TYPE, primary_key=True, autoincrement=True)
    contributor_id: Mapped[int | None] = mapped_column(BigInteger)
    contributor_nickname: Mapped[str | None] = mapped_column(String)
    is_anonymous: Mapped[bool] = mapped_column(Boolean, default=True)
    company_id: Mapped[int | None] = mapped_column(ForeignKey("contribution_company.id"))
    department: Mapped[str | None] = mapped_column(String)
    position: Mapped[str | None] = mapped_column(String)
    interview_year: Mapped[int | None] = mapped_column(Integer)
    interview_month: Mapped[int | None] = mapped_column(Integer)
    interview_type: Mapped[str | None] = mapped_column(String)
    interview_round: Mapped[int] = mapped_column(Integer, default=1)
    source: Mapped[str] = mapped_column(String, default="USER")
    verified: Mapped[bool] = mapped_column(Boolean, default=False)
    verifier_id: Mapped[int | None] = mapped_column(BigInteger)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime)
    view_count: Mapped[int] = mapped_column(Integer, default=0)
    helpful_count: Mapped[int] = mapped_column(Integer, default=0)
    company: Mapped[ContributionCompany | None] = relationship()
    questions: Mapped[list[ContributionQuestion]] = relationship(
        back_populates="contribution", cascade="all, delete-orphan"
    )


contribution_question_topics = Table(
    "contribution_question_topic",
    Base.metadata,
    Column(
        "question_id",
        ForeignKey("contribution_question.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "topic_id",
        ForeignKey("contribution_topic.id", ondelete="CASCADE"),
        primary_key=True,
    ),
)


class ContributionQuestion(Base, Timestamps):
    __tablename__ = "contribution_question"
    id: Mapped[int] = mapped_column(PRIMARY_KEY_TYPE, primary_key=True, autoincrement=True)
    contribution_id: Mapped[int] = mapped_column(ForeignKey("contribution.id", ondelete="CASCADE"))
    question_text: Mapped[str] = mapped_column(Text, nullable=False)
    follow_up_text: Mapped[str | None] = mapped_column(Text)
    category_key: Mapped[str | None] = mapped_column(String)
    category_label: Mapped[str | None] = mapped_column(String)
    difficulty: Mapped[str | None] = mapped_column(String)
    question_type: Mapped[str | None] = mapped_column(String)
    answer_text: Mapped[str | None] = mapped_column(Text)
    key_points: Mapped[list[str] | None] = mapped_column(ARRAY(Text).with_variant(JSON(), "sqlite"))
    ideal_answer_hint: Mapped[str | None] = mapped_column(Text)
    ai_enhanced: Mapped[bool] = mapped_column(Boolean, default=False)
    ai_summary: Mapped[str | None] = mapped_column(Text)
    mapped_skill_id: Mapped[str | None] = mapped_column(String)
    mapped_ref_file: Mapped[str | None] = mapped_column(String)
    contribution: Mapped[Contribution] = relationship(back_populates="questions")
    topics: Mapped[list[ContributionTopic]] = relationship(secondary=contribution_question_topics)
