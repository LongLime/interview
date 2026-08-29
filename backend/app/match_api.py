from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import BusinessError, Result, decrypt_secret
from app.database import get_db
from app.embeddings import cosine_similarity, embed_texts, embedding_client
from app.integrations import OpenAIClient
from app.matching import (
    RawDetailedMatch,
    ScreeningBatch,
    TokenUsage,
    build_detail_prompt,
    build_screen_prompt,
    compute_detailed_match,
)
from app.models import JobTarget, LlmProvider, MatchResult, Resume, ResumeAnalysis
from app.schemas import JobTargetCreate, SingleMatchRequest, SmartMatchRequest
from app.scoring import (
    GRADE_VERDICT,
    SCREEN_HARD_EXCLUDE,
    CandidateProfile,
    compute_screen_score,
    grade_from_match_score,
    match_score_from_annotations,
)

router = APIRouter(prefix="/api")
Db = Annotated[AsyncSession, Depends(get_db)]
MATCH_VERSION = "job-agent-v1"


async def provider_client(
    request: Request, db: AsyncSession, provider_id: str | None
) -> tuple[OpenAIClient, str, str]:
    if provider_id:
        provider = await db.get(LlmProvider, provider_id)
        if not provider or not provider.enabled:
            raise BusinessError(7001, f"AI Provider不存在或未启用: {provider_id}")
        key = decrypt_secret(
            provider.api_key_ciphertext,
            provider.api_key_nonce,
            request.app.state.settings.jwt_secret,
        )
        return OpenAIClient(provider.base_url, key, provider.model), provider.id, provider.model
    config = request.app.state.settings
    return (
        OpenAIClient(config.ai_base_url, config.ai_bailian_api_key, config.ai_model),
        "dashscope",
        config.ai_model,
    )


async def latest_profile(db: AsyncSession, resume_id: int) -> CandidateProfile | None:
    value = await db.scalar(
        select(ResumeAnalysis.candidate_profile_json)
        .where(
            ResumeAnalysis.resume_id == resume_id,
            ResumeAnalysis.candidate_profile_json.is_not(None),
        )
        .order_by(ResumeAnalysis.analyzed_at.desc(), ResumeAnalysis.id.desc())
        .limit(1)
    )
    if not value:
        return None
    try:
        return CandidateProfile.model_validate(value)
    except ValidationError:
        return None


async def validated_call(
    client: OpenAIClient,
    prompt: str,
    model_type,
    expected_job_ids: set[int] | None = None,
):
    last_error: Exception | None = None
    for _attempt in range(2):
        try:
            raw, usage = await client.complete_json_with_usage(
                [{"role": "user", "content": prompt}], model_type.model_json_schema()
            )
            value = model_type.model_validate(raw)
            if expected_job_ids is not None:
                value.validate_coverage(expected_job_ids)
            return value, TokenUsage.model_validate(usage)
        except Exception as exc:
            last_error = exc
    message = last_error.message if isinstance(last_error, BusinessError) else str(last_error)
    raise BusinessError(7003, f"AI结构化输出校验失败（重试后）: {message}") from last_error


def result_data(row: MatchResult) -> dict:
    annotations = row.annotations_json or []
    normalized_score = match_score_from_annotations(annotations)
    score = normalized_score if normalized_score is not None else row.score
    grade = grade_from_match_score(score) if normalized_score is not None else row.grade
    return {
        "id": row.id,
        "resumeId": row.resume_id,
        "jobTargetId": row.job_target_id,
        "company": row.company,
        "title": row.title,
        "jdText": row.jd_text,
        "screenDecisions": row.screen_decisions_json,
        "screenScore": row.screen_score,
        "hardExcluded": row.hard_excluded,
        "score": score,
        "grade": grade,
        "verdict": GRADE_VERDICT[grade] if normalized_score is not None else row.verdict,
        "annotations": annotations,
        "interviewTips": row.interview_tips or "",
        "gaps": row.gaps_json or [],
        "provider": row.provider,
        "model": row.model,
        "status": row.status,
        "error": row.error,
        "tokenUsage": {
            "promptTokens": row.prompt_tokens or 0,
            "completionTokens": row.completion_tokens or 0,
            "totalTokens": row.total_tokens or 0,
        },
        "version": row.match_version,
        "createdAt": row.created_at.isoformat() if row.created_at else None,
        "updatedAt": row.updated_at.isoformat() if row.updated_at else None,
    }


def job_data(row: JobTarget) -> dict:
    return {
        "id": row.id,
        "company": row.company,
        "title": row.title,
        "jdText": row.jd_text,
        "location": row.location,
        "sourceUrl": row.source_url,
        "metadata": row.metadata_json,
        "createdAt": row.created_at,
        "updatedAt": row.updated_at,
    }


@router.post("/jobs")
async def create_job(body: JobTargetCreate, db: Db):
    row = JobTarget(
        company=body.company,
        title=body.title,
        jd_text=body.jd_text,
        location=body.location,
        source_url=body.source_url,
        metadata_json=body.metadata,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return Result.ok(job_data(row))


@router.get("/jobs")
async def list_jobs(db: Db):
    rows = (await db.scalars(select(JobTarget).order_by(JobTarget.id))).all()
    return Result.ok([job_data(row) for row in rows])


@router.get("/jobs/{job_id}")
async def get_job(job_id: int, db: Db):
    row = await db.get(JobTarget, job_id)
    if not row:
        raise BusinessError(404, "岗位不存在")
    return Result.ok(job_data(row))


@router.delete("/jobs/{job_id}")
async def delete_job(job_id: int, db: Db):
    row = await db.get(JobTarget, job_id)
    if not row:
        raise BusinessError(404, "岗位不存在")
    await db.delete(row)
    await db.commit()
    return Result.ok()


async def persist_detail(
    db: AsyncSession,
    resume: Resume,
    job: JobTarget | None,
    jd_text: str,
    company: str | None,
    title: str | None,
    client: OpenAIClient,
    provider: str,
    model: str,
    screen: dict | None = None,
) -> MatchResult:
    profile = await latest_profile(db, resume.id)
    row = None
    if job:
        row = await db.scalar(
            select(MatchResult).where(
                MatchResult.resume_id == resume.id,
                MatchResult.job_target_id == job.id,
            )
        )
    if not row:
        row = MatchResult(
            resume_id=resume.id,
            job_target_id=job.id if job else None,
            company=company,
            title=title,
            jd_text=jd_text,
            status="ANALYZING",
            match_version=MATCH_VERSION,
        )
        db.add(row)
    if screen:
        row.screen_decisions_json = screen["decisions"]
        row.screen_score = screen["score"]
        row.hard_excluded = screen["hard_excluded"]
    row.provider, row.model, row.error = provider, model, None
    try:
        raw, usage = await validated_call(
            client,
            build_detail_prompt(resume.resume_text or "", jd_text, company, title, profile),
            RawDetailedMatch,
        )
        detail = compute_detailed_match(raw)
        row.score = detail["score"]
        row.grade = detail["grade"]
        row.verdict = detail["verdict"]
        row.annotations_json = detail["annotations"]
        row.interview_tips = detail["interview_tips"]
        row.gaps_json = detail["gaps"]
        row.prompt_tokens = usage.prompt_tokens
        row.completion_tokens = usage.completion_tokens
        row.total_tokens = usage.total_tokens
        row.status = "COMPLETED"
    except Exception as exc:
        row.status = "FAILED"
        row.error = (exc.message if isinstance(exc, BusinessError) else str(exc))[:2000]
        await db.commit()
        raise
    await db.commit()
    await db.refresh(row)
    analysis = await db.scalar(
        select(ResumeAnalysis)
        .where(ResumeAnalysis.resume_id == resume.id)
        .order_by(ResumeAnalysis.analyzed_at.desc(), ResumeAnalysis.id.desc())
        .limit(1)
    )
    if analysis:
        analysis.analysis_mode = "CUSTOM_JD"
        analysis.job_title = row.title
        analysis.company_name = row.company
        analysis.jd_text = row.jd_text
        analysis.job_match_result_json = result_data(row)
        await db.commit()
    return row


@router.post("/match/analyze-single")
async def analyze_single(body: SingleMatchRequest, request: Request, db: Db):
    resume = await db.get(Resume, body.resume_id)
    if not resume:
        raise BusinessError(2001, "简历不存在")
    job = await db.get(JobTarget, body.job_target_id) if body.job_target_id else None
    if body.job_target_id and not job:
        raise BusinessError(404, "岗位不存在")
    client, provider, model = await provider_client(request, db, body.provider)
    row = await persist_detail(
        db,
        resume,
        job,
        body.jd_text,
        body.company or (job.company if job else None),
        body.title or (job.title if job else None),
        client,
        provider,
        model,
    )
    return Result.ok(result_data(row))


@router.get("/match/resume/{resume_id}")
async def results_for_resume(resume_id: int, db: Db):
    rows = (
        await db.scalars(
            select(MatchResult)
            .where(MatchResult.resume_id == resume_id)
            .order_by(MatchResult.score.desc(), MatchResult.id.desc())
        )
    ).all()
    return Result.ok([result_data(row) for row in rows])


@router.get("/match/results/{result_id}")
async def get_result(result_id: int, db: Db):
    row = await db.get(MatchResult, result_id)
    if not row:
        raise BusinessError(404, "匹配结果不存在")
    return Result.ok(result_data(row))


async def run_smart_task(request: Request, task, body: SmartMatchRequest) -> None:
    manager = request.app.state.match_tasks
    factory = request.app.state.session_factory
    try:
        async with factory() as db:
            resume = await db.get(Resume, body.resume_id)
            if not resume:
                await manager.update(task, phase="error", error="简历不存在")
                return
            jobs = (await db.scalars(select(JobTarget).order_by(JobTarget.id))).all()
            embed_client = await embedding_client(request, db) if body.use_embedding else None
            job_sim: dict[int, float] = {}
            if embed_client is not None and jobs:
                try:
                    vectors = await embed_texts(
                        embed_client,
                        [resume.resume_text or ""] + [job.jd_text or "" for job in jobs],
                    )
                    resume_vec = vectors[0]
                    job_sim = {
                        job.id: cosine_similarity(resume_vec, vec)
                        for job, vec in zip(jobs, vectors[1:], strict=True)
                    }
                except (BusinessError, ValueError):
                    job_sim = {}
            if body.embedding_cap and job_sim:
                ranked = sorted(jobs, key=lambda job: job_sim.get(job.id, 0.0), reverse=True)
                jobs = ranked[: body.embedding_cap]
            profile = await latest_profile(db, resume.id)
            client, provider, model = await provider_client(request, db, body.provider)
            await manager.update(
                task,
                phase="screening",
                totalJobs=len(jobs),
                screenDone=0,
                screenTotal=len(jobs),
                analyzeDone=0,
                screenTokens=0,
                analyzeTokens=0,
            )
            promoted: list[tuple[JobTarget, int, dict]] = []
            screen_tokens = 0
            for offset in range(0, len(jobs), body.batch_size):
                if task.cancelled:
                    return
                batch = jobs[offset : offset + body.batch_size]
                payload = [
                    {
                        "id": job.id,
                        "company": job.company,
                        "title": job.title,
                        "jd_text": job.jd_text,
                    }
                    for job in batch
                ]
                raw, usage = await validated_call(
                    client,
                    build_screen_prompt(resume.resume_text or "", profile, payload),
                    ScreeningBatch,
                    {job.id for job in batch},
                )
                screen_tokens += usage.total_tokens
                decisions = {decision.job_id: decision for decision in raw.results}
                for job in batch:
                    decision = decisions[job.id]
                    score = compute_screen_score(decision.degree, decision.major, decision.skill)
                    screen = {
                        "decisions": decision.model_dump(),
                        "score": score,
                        "hard_excluded": score == SCREEN_HARD_EXCLUDE,
                    }
                    row = await db.scalar(
                        select(MatchResult).where(
                            MatchResult.resume_id == resume.id,
                            MatchResult.job_target_id == job.id,
                        )
                    )
                    if not row:
                        row = MatchResult(
                            resume_id=resume.id,
                            job_target_id=job.id,
                            company=job.company,
                            title=job.title,
                            jd_text=job.jd_text,
                            match_version=MATCH_VERSION,
                        )
                        db.add(row)
                    row.screen_decisions_json = screen["decisions"]
                    row.screen_score = score
                    row.hard_excluded = screen["hard_excluded"]
                    row.provider, row.model = provider, model
                    row.status = "SCREENED"
                    if score >= body.threshold and not row.hard_excluded:
                        promoted.append((job, score, screen))
                await db.commit()
                await manager.update(
                    task,
                    screenDone=min(offset + len(batch), len(jobs)),
                    screenTokens=screen_tokens,
                )

        if job_sim:
            promoted.sort(
                key=lambda item: (item[1], job_sim.get(item[0].id, 0.0)), reverse=True
            )
        else:
            promoted.sort(key=lambda item: item[1], reverse=True)
        await manager.update(
            task,
            phase="analyzing",
            passed=len(promoted),
            analyzeTotal=len(promoted),
        )
        semaphore = asyncio.Semaphore(body.concurrency)
        counter_lock = asyncio.Lock()
        analyze_done = 0
        analyze_tokens = 0

        async def analyze(entry: tuple[JobTarget, int, dict]) -> None:
            nonlocal analyze_done, analyze_tokens
            async with semaphore:
                if task.cancelled:
                    return
                job, _score, screen = entry
                async with factory() as db:
                    resume = await db.get(Resume, body.resume_id)
                    db_job = await db.get(JobTarget, job.id)
                    client, provider, model = await provider_client(request, db, body.provider)
                    row = await persist_detail(
                        db,
                        resume,
                        db_job,
                        db_job.jd_text,
                        db_job.company,
                        db_job.title,
                        client,
                        provider,
                        model,
                        screen,
                    )
                    async with counter_lock:
                        analyze_done += 1
                        analyze_tokens += row.total_tokens or 0
                        await manager.update(
                            task,
                            analyzeDone=analyze_done,
                            analyzeTokens=analyze_tokens,
                            current={"jobId": job.id, "company": job.company, "score": row.score},
                        )

        await asyncio.gather(*(analyze(entry) for entry in promoted))
        if not task.cancelled:
            await manager.update(task, phase="done", message="匹配完成")
    except asyncio.CancelledError:
        if not task.cancelled:
            await manager.update(task, phase="cancelled", message="已取消；已提交结果保留")
    except Exception as exc:
        message = exc.message if isinstance(exc, BusinessError) else str(exc)
        await manager.update(task, phase="error", error=message)


@router.post("/match/smart")
async def start_smart(body: SmartMatchRequest, request: Request, db: Db):
    if not await db.get(Resume, body.resume_id):
        raise BusinessError(2001, "简历不存在")
    manager = request.app.state.match_tasks

    async def runner(task):
        await run_smart_task(request, task, body)

    existing = manager.active_for_resume(body.resume_id)
    task = existing or manager.create(body.resume_id, body.threshold, runner)
    return Result.ok({"taskId": task.id, "existing": existing is not None})


@router.get("/match/smart/active/{resume_id}")
async def active_smart(resume_id: int, request: Request):
    task = request.app.state.match_tasks.active_for_resume(resume_id)
    return Result.ok(
        {"active": False}
        if not task
        else {"active": True, "taskId": task.id, "progress": task.progress}
    )


@router.get("/match/smart/{task_id}")
async def smart_status(task_id: str, request: Request):
    task = request.app.state.match_tasks.tasks.get(task_id)
    if not task:
        raise BusinessError(404, "任务不存在")
    return Result.ok(task.progress)


@router.post("/match/smart/{task_id}/cancel")
async def cancel_smart(task_id: str, request: Request):
    task = await request.app.state.match_tasks.cancel(task_id)
    if not task:
        raise BusinessError(404, "任务不存在")
    return Result.ok({"success": True, "progress": task.progress})


@router.get("/match/smart/stream/{task_id}")
async def stream_smart(task_id: str, request: Request):
    task = request.app.state.match_tasks.tasks.get(task_id)
    if not task:
        raise BusinessError(404, "任务不存在")

    async def events() -> AsyncIterator[str]:
        previous = None
        while True:
            snapshot = json.dumps(task.progress, ensure_ascii=False, default=str)
            if snapshot != previous:
                yield f"data: {snapshot}\n\n"
                previous = snapshot
            if task.progress.get("phase") in {"done", "error", "cancelled"}:
                return
            async with task.changed:
                try:
                    await asyncio.wait_for(task.changed.wait(), timeout=15)
                except TimeoutError:
                    yield ": keepalive\n\n"

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
