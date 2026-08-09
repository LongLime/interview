from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import Field, HttpUrl

from app.core import ApiModel


class LoginRequest(ApiModel):
    username: str = Field(min_length=1, max_length=50)
    password: str = Field(min_length=6, max_length=128)


class RegisterRequest(LoginRequest):
    nickname: str = Field(min_length=1, max_length=100)


class ScheduleRequest(ApiModel):
    company_name: str = Field(min_length=1, max_length=255)
    position: str = Field(min_length=1, max_length=255)
    interview_time: datetime
    interview_type: Literal["ONSITE", "VIDEO", "PHONE"] | None = None
    meeting_link: str | None = None
    round_number: int = Field(default=1, ge=1, le=20)
    interviewer: str | None = None
    notes: str | None = None


class StatusRequest(ApiModel):
    status: Literal["PENDING", "COMPLETED", "CANCELLED", "RESCHEDULED"]


class CategoryRequest(ApiModel):
    category: str | None = Field(default=None, max_length=100)


class QueryRequest(ApiModel):
    knowledge_base_ids: list[int] = Field(min_length=1)
    question: str = Field(min_length=1, max_length=10000)


class RagSessionRequest(ApiModel):
    knowledge_base_ids: list[int]
    title: str | None = Field(default=None, max_length=255)


class TitleRequest(ApiModel):
    title: str = Field(min_length=1, max_length=255)


class ProviderCreate(ApiModel):
    id: str = Field(pattern=r"^[a-zA-Z0-9_-]{1,64}$")
    base_url: HttpUrl
    api_key: str = Field(min_length=1)
    model: str = Field(min_length=1, max_length=128)
    embedding_model: str | None = None
    embedding_dimensions: int | None = Field(default=None, ge=1)
    supports_embedding: bool = False
    temperature: float | None = Field(default=None, ge=0, le=2)


class ProviderUpdate(ApiModel):
    base_url: HttpUrl | None = None
    api_key: str | None = None
    model: str | None = None
    embedding_model: str | None = None
    embedding_dimensions: int | None = Field(default=None, ge=1)
    supports_embedding: bool | None = None
    temperature: float | None = Field(default=None, ge=0, le=2)


class DefaultProvider(ApiModel):
    default_provider: str
    default_embedding_provider: str


class CreateTextInterview(ApiModel):
    resume_text: str = Field(min_length=1)
    question_count: int = Field(ge=1, le=50)
    resume_id: int | None = None
    force_create: bool = False
    llm_provider: str | None = None
    skill_id: str
    difficulty: Literal["junior", "mid", "senior"] = "mid"
    custom_categories: list[dict] | None = None
    jd_text: str | None = None


class AnswerRequest(ApiModel):
    question_index: int = Field(ge=0)
    answer: str = Field(min_length=1, max_length=50000)


class QuestionEvaluation(ApiModel):
    question_index: int = Field(ge=0)
    score: int = Field(ge=0, le=100)
    feedback: str = Field(min_length=1)
    reference_answer: str = Field(min_length=1)
    key_points: list[str]


class InterviewEvaluationResult(ApiModel):
    overall_feedback: str = Field(min_length=1)
    strengths: list[str]
    improvements: list[str]
    question_evaluations: list[QuestionEvaluation]


class ContributionQuestionSubmit(ApiModel):
    question_text: str = Field(min_length=1)
    follow_up_text: str | None = None
    category_key: str | None = Field(default=None, max_length=50)
    category_label: str | None = Field(default=None, max_length=100)
    difficulty: Literal["EASY", "MEDIUM", "HARD"] | None = None
    question_type: (
        Literal["SINGLE", "MULTI", "CODING", "DESIGN", "DISCUSSION", "BEHAVIOR"] | None
    ) = None
    answer_text: str | None = None
    key_points: list[str] | None = None


class ContributionSubmit(ApiModel):
    company_id: int
    department: str | None = Field(default=None, max_length=200)
    position: str = Field(min_length=1, max_length=100)
    interview_year: int = Field(ge=1900, le=2200)
    interview_month: int = Field(ge=1, le=12)
    interview_type: Literal["SOCIAL", "CAMPUS", "INTERN"] | None = None
    interview_round: int | None = Field(default=None, ge=1)
    questions: list[ContributionQuestionSubmit] = Field(min_length=1)
    contributor_nickname: str | None = Field(default=None, max_length=50)
    anonymous: bool


class VoiceCreate(ApiModel):
    role_type: str = "TECHNICAL_INTERVIEWER"
    skill_id: str
    difficulty: str = "mid"
    custom_jd_text: str | None = None
    resume_id: int | None = None
    intro_enabled: bool = True
    tech_enabled: bool = True
    project_enabled: bool = True
    hr_enabled: bool = True
    planned_duration: int = Field(default=30, ge=1, le=180)
    llm_provider: str | None = None


class JobTargetCreate(ApiModel):
    company: str | None = Field(default=None, max_length=255)
    title: str = Field(min_length=1, max_length=255)
    jd_text: str = Field(min_length=1)
    location: str | None = Field(default=None, max_length=255)
    source_url: str | None = Field(default=None, max_length=1000)
    metadata: dict | None = None


class SingleMatchRequest(ApiModel):
    resume_id: int
    jd_text: str = Field(min_length=1)
    company: str | None = Field(default=None, max_length=255)
    title: str | None = Field(default=None, max_length=255)
    provider: str | None = None
    job_target_id: int | None = None


class SmartMatchRequest(ApiModel):
    resume_id: int
    threshold: int = 0
    batch_size: int = Field(default=50, ge=1, le=100)
    concurrency: int = Field(default=3, ge=1, le=10)
    provider: str | None = None


class ScrapeTaskRequest(ApiModel):
    task_name: str = Field(min_length=1)
    source_url: HttpUrl
    description: str | None = None
    cron_expression: str | None = None
