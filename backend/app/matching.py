from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Literal
from uuid import uuid4

from pydantic import Field, model_validator

from app.scoring import (
    GRADE_VERDICT,
    CandidateProfile,
    StrictModel,
    grade_from_match_score,
    lookup_delta,
    match_score_from_annotations,
    render_match_scoring_for_prompt,
)


class TokenUsage(StrictModel):
    prompt_tokens: int = Field(default=0, ge=0)
    completion_tokens: int = Field(default=0, ge=0)
    total_tokens: int = Field(default=0, ge=0)


class ScreenDecision(StrictModel):
    job_id: int
    degree: Literal["ok", "over", "below", "na"]
    major: Literal["match", "related", "mismatch", "na"]
    skill: Literal["strong", "weak", "none", "na"]
    reason: str = Field(min_length=1)


class ScreeningBatch(StrictModel):
    results: list[ScreenDecision]

    def validate_coverage(self, expected_job_ids: set[int]) -> None:
        ids = [result.job_id for result in self.results]
        if len(ids) != len(set(ids)):
            raise ValueError("duplicate screening job_id")
        if set(ids) != expected_job_ids:
            raise ValueError("screening response must cover exactly the requested jobs")


class RawAnnotation(StrictModel):
    requirement_id: str = Field(min_length=1)
    kind: Literal["plus", "minus"]
    weight: Literal["hard", "must", "nice"]
    status: Literal["hit", "partial", "missing"]
    label: str = Field(min_length=1)
    reason: str = Field(min_length=1)
    color: Literal["red", "orange", "yellow", "green", "blue"]
    job_text: str | None = None
    resume_text: str | None = None

    @model_validator(mode="after")
    def validate_evidence(self):
        if self.kind == "minus" and not self.job_text:
            raise ValueError("minus annotations require an exact job_text requirement")
        if self.status in {"hit", "partial"} and not self.resume_text:
            raise ValueError("hit/partial annotations require exact resume_text evidence")
        if self.status == "missing" and self.resume_text:
            raise ValueError("missing annotations cannot claim resume evidence")
        return self


class RawGap(StrictModel):
    """A single gap between the user resume and an ideal candidate for the JD.

    Unlike annotations (which adjudicate explicit JD requirements), gaps are
    forward-looking: what the candidate still needs to become a strong fit.
    """

    requirement: str = Field(min_length=1)
    weight: Literal["hard", "must", "nice"]
    evidence: str | None = None
    suggestion: str = Field(min_length=1)


class RawDetailedMatch(StrictModel):
    annotations: list[RawAnnotation]
    interview_tips: str
    gaps: list[RawGap] = Field(default_factory=list)

    @model_validator(mode="after")
    def unique_requirements(self):
        ids = [annotation.requirement_id for annotation in self.annotations]
        if len(ids) != len(set(ids)):
            raise ValueError("duplicate requirement_id")
        return self


def compute_detailed_match(raw: RawDetailedMatch | dict) -> dict:
    raw = raw if isinstance(raw, RawDetailedMatch) else RawDetailedMatch.model_validate(raw)
    annotations = []
    for item in raw.annotations:
        delta = lookup_delta(item.kind, item.weight, item.status)
        data = item.model_dump(exclude_none=True)
        data.update(
            delta=delta,
            type="match"
            if item.kind == "plus"
            else "mismatch"
            if item.status == "missing"
            else "suggestion",
            comment=item.reason,
        )
        annotations.append(data)
    score = match_score_from_annotations(annotations) or 0
    grade = grade_from_match_score(score)
    return {
        "score": score,
        "grade": grade,
        "verdict": GRADE_VERDICT[grade],
        "annotations": annotations,
        "interview_tips": raw.interview_tips,
        "gaps": [
            {
                "requirement": gap.requirement,
                "weight": gap.weight,
                "evidence": gap.evidence,
                "suggestion": gap.suggestion,
            }
            for gap in raw.gaps
        ],
    }


def render_profile(profile: CandidateProfile | None) -> str:
    if not profile:
        return "（暂无结构化画像，请依据简历原文判断）"
    education = profile.education
    return "\n".join(
        (
            "学历："
            f"{education.degree or '未知'} / {education.major or '未知'} / "
            f"{education.university or '未知'}",
            f"目标城市：{profile.target_city or '未知'}",
            f"目标岗位：{'、'.join(profile.inferred_target_roles) or '未知'}",
            f"技能：{'、'.join(profile.skill_tags[:20]) or '未知'}",
            f"经历方向：{'、'.join(profile.experience_tags) or '未知'}",
            f"行业：{'、'.join(profile.experience_industries) or '未知'}",
        )
    )


def build_detail_prompt(
    resume_text: str,
    jd_text: str,
    company: str | None,
    title: str | None,
    profile: CandidateProfile | None,
) -> str:
    return f"""你是资深求职顾问。逐条对比简历和招聘信息，只报告客观裁决，绝不输出分数。

候选人画像：
{render_profile(profile)}

简历原文：
{resume_text or "（空）"}

招聘信息（公司：{company or "未知"}；职位：{title or "未知"}）：
{jd_text}

{render_match_scoring_for_prompt()}

每个明确要求使用稳定且唯一的 requirement_id。job_text 和 resume_text 必须从上述原文精确复制，
不得改写。minus 只能用于招聘原文明示的要求；missing 不得伪造 resume_text；hit/partial 必须有
resume_text 证据。不要为无关经历或招聘未要求的内容生成 annotation。输出面试准备建议。

另请输出差距清单 gaps（0 至 8 条）：站在"该岗位理想候选人"视角，指出候选人
当前最需要补齐的能力或经历。每条给出 requirement（理想候选人应具备、但候选人欠缺或不足的
能力/经历，用客观描述）、weight（hard/must/nice）、evidence（候选人简历中的现状片段，可空）
和 suggestion（具体可执行的补齐建议）。gaps 不得编造岗位未要求的能力，也不得与 annotations
重复堆砌，只聚焦最关键的差距。
"""


def build_screen_prompt(
    resume_text: str,
    profile: CandidateProfile | None,
    jobs: list[dict],
) -> str:
    job_text = "\n\n".join(
        f"[ID:{job['id']}] {job.get('company') or '未知'} | "
        f"{job.get('title') or '未知'}\n{job['jd_text']}"
        for job in jobs
    )
    return f"""快速初筛以下全部岗位。你只判定 degree/major/skill，绝不输出分数。
degree: ok/over/below/na；major: match/related/mismatch/na；skill: strong/weak/none/na。
必须覆盖每个 [ID] 恰好一次，不得添加其他 ID。优先依据画像并以简历原文核对。

画像：
{render_profile(profile)}

简历：
{resume_text}

岗位：
{job_text}
"""


TerminalPhase = Literal["done", "error", "cancelled"]


@dataclass
class MatchTask:
    id: str
    resume_id: int
    threshold: int
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    progress: dict = field(default_factory=lambda: {"phase": "pending"})
    cancelled: bool = False
    runner: asyncio.Task | None = None
    changed: asyncio.Condition = field(default_factory=asyncio.Condition)


class MatchTaskManager:
    """Single-process task registry. Committed database results intentionally outlive tasks."""

    def __init__(self):
        self.tasks: dict[str, MatchTask] = {}

    def active_for_resume(self, resume_id: int) -> MatchTask | None:
        return next(
            (
                task
                for task in self.tasks.values()
                if task.resume_id == resume_id
                and task.progress.get("phase") not in {"done", "error", "cancelled"}
            ),
            None,
        )

    def create(
        self,
        resume_id: int,
        threshold: int,
        run: Callable[[MatchTask], Awaitable[None]],
    ) -> MatchTask:
        existing = self.active_for_resume(resume_id)
        if existing:
            return existing
        task = MatchTask(id=f"task_{uuid4().hex}", resume_id=resume_id, threshold=threshold)
        self.tasks[task.id] = task
        task.runner = asyncio.create_task(run(task))
        return task

    async def update(self, task: MatchTask, **values) -> None:
        task.progress = {**task.progress, **values}
        async with task.changed:
            task.changed.notify_all()

    async def cancel(self, task_id: str) -> MatchTask | None:
        task = self.tasks.get(task_id)
        if not task:
            return None
        task.cancelled = True
        await self.update(task, phase="cancelled", message="已取消；已提交结果保留")
        if task.runner and not task.runner.done():
            task.runner.cancel()
        return task


task_manager = MatchTaskManager()
