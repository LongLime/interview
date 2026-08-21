from __future__ import annotations

import asyncio
import hashlib
import io
import json
import re
import uuid
from datetime import UTC, datetime, time
from pathlib import Path
from typing import Annotated, Any
from urllib.parse import quote

import boto3
from docx import Document
from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    Form,
    Request,
    UploadFile,
    WebSocket,
    WebSocketDisconnect,
)
from fastapi.responses import Response, StreamingResponse
from pypdf import PdfReader
from sqlalchemy import delete, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.career_fair_scraper import CqbysCareerFairCrawler
from app.core import (
    BusinessError,
    Result,
    Settings,
    create_token,
    current_user,
    decrypt_secret,
    encrypt_secret,
    password_hash,
)
from app.database import get_db
from app.integrations import OpenAIClient
from app.models import (
    AppUser,
    CareerFair,
    Contribution,
    ContributionCompany,
    ContributionQuestion,
    ContributionTopic,
    InterviewAnswer,
    InterviewSchedule,
    InterviewSession,
    KnowledgeBase,
    LlmGlobalSetting,
    LlmProvider,
    RagChatSession,
    Resume,
    ResumeAnalysis,
    ScrapeRecord,
    ScrapeTask,
    VoiceEvaluation,
    VoiceMessage,
    VoiceSession,
    utc_now,
)
from app.pdf_export import interview_pdf, resume_pdf
from app.schemas import (
    AnswerRequest,
    CategoryRequest,
    ContributionSubmit,
    CreateTextInterview,
    DefaultProvider,
    InterviewEvaluationResult,
    LoginRequest,
    ProviderCreate,
    ProviderUpdate,
    QueryRequest,
    RagSessionRequest,
    RegisterRequest,
    ScheduleRequest,
    ScrapeTaskRequest,
    StatusRequest,
    TitleRequest,
    VoiceCreate,
)
from app.scoring import (
    GRADE_VERDICT,
    RawAnalysis,
    build_resume_analysis_prompt,
    compute_analysis,
    grade_from_match_score,
    match_score_from_annotations,
)

router = APIRouter(prefix="/api")
Db = Annotated[AsyncSession, Depends(get_db)]


def ok(data: Any = None, message: str = "success") -> Result[Any]:
    return Result.ok(data, message)


def camel(value: str) -> str:
    head, *tail = value.split("_")
    return head + "".join(part.capitalize() for part in tail)


def as_dict(obj: Any, *fields: str) -> dict[str, Any]:
    return {camel(field): getattr(obj, field) for field in fields}


def settings(request: Request) -> Settings:
    return request.app.state.settings


def raw_pdf(content: bytes, filename: str) -> Response:
    encoded = quote(filename, safe="")
    return Response(
        content=content,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{encoded}"},
    )


def contribution_item(row: Contribution) -> dict[str, Any]:
    labels = list(
        dict.fromkeys(
            question.category_label for question in row.questions if question.category_label
        )
    )
    return {
        "id": row.id,
        "companyName": row.company.name if row.company else "未知公司",
        "companyId": row.company_id,
        "department": row.department,
        "position": row.position,
        "interviewYear": row.interview_year,
        "interviewMonth": row.interview_month,
        "interviewType": row.interview_type,
        "interviewRound": row.interview_round,
        "contributorNickname": "匿名用户" if row.is_anonymous else row.contributor_nickname,
        "anonymous": row.is_anonymous,
        "verified": row.verified,
        "viewCount": row.view_count or 0,
        "helpfulCount": row.helpful_count or 0,
        "questionCount": len(row.questions),
        "categoryLabels": labels,
        "createdAt": row.created_at,
    }


def contribution_detail(row: Contribution) -> dict[str, Any]:
    data = contribution_item(row)
    data.pop("questionCount")
    data.pop("categoryLabels")
    data["questions"] = [
        {
            "id": question.id,
            "questionText": question.question_text,
            "followUpText": question.follow_up_text,
            "categoryKey": question.category_key,
            "categoryLabel": question.category_label,
            "difficulty": question.difficulty,
            "questionType": question.question_type,
            "answerText": question.answer_text,
            "keyPoints": question.key_points or [],
            "topics": [topic.topic_label for topic in question.topics],
            "createdAt": question.created_at,
        }
        for question in row.questions
    ]
    return data


def contribution_load():
    return (
        selectinload(Contribution.company),
        selectinload(Contribution.questions).selectinload(ContributionQuestion.topics),
    )


@router.get("/contributions")
async def list_contributions(
    db: Db,
    companyId: int | None = None,
    position: str | None = None,
    year: int | None = None,
    type: str | None = None,
    page: int = 0,
    size: int = 10,
):
    if page < 0 or size < 1 or size > 100:
        raise BusinessError(400, "分页参数无效")
    filters = [Contribution.verified.is_(True)]
    if companyId is not None:
        filters.append(Contribution.company_id == companyId)
    if position and position.strip():
        filters.append(Contribution.position.ilike(f"%{position.strip()}%"))
    if year is not None:
        filters.append(Contribution.interview_year == year)
    if type:
        filters.append(Contribution.interview_type == type)
    total = await db.scalar(select(func.count(Contribution.id)).where(*filters)) or 0
    rows = (
        await db.scalars(
            select(Contribution)
            .options(*contribution_load())
            .where(*filters)
            .order_by(Contribution.created_at.desc(), Contribution.id.desc())
            .offset(page * size)
            .limit(size)
        )
    ).all()
    return {
        "content": [contribution_item(row) for row in rows],
        "totalElements": total,
        "totalPages": (total + size - 1) // size,
        "size": size,
        "number": page,
    }


@router.post("/contributions")
async def submit_contribution(body: ContributionSubmit, db: Db):
    company = await db.get(ContributionCompany, body.company_id)
    if not company:
        raise BusinessError(404, "公司不存在")
    row = Contribution(
        company=company,
        department=body.department,
        position=body.position,
        interview_year=body.interview_year,
        interview_month=body.interview_month,
        interview_type=body.interview_type or "SOCIAL",
        interview_round=body.interview_round or 1,
        contributor_nickname="匿名用户" if body.anonymous else body.contributor_nickname,
        is_anonymous=body.anonymous,
        verified=False,
        source="USER",
    )
    row.questions = [
        ContributionQuestion(
            question_text=question.question_text,
            follow_up_text=question.follow_up_text,
            category_key=question.category_key,
            category_label=question.category_label,
            difficulty=question.difficulty or "MEDIUM",
            question_type=question.question_type or "DISCUSSION",
            answer_text=question.answer_text,
            key_points=question.key_points,
        )
        for question in body.questions
    ]
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return {"success": True, "message": "面经提交成功，等待审核", "id": row.id}


@router.get("/contributions/companies")
async def contribution_companies(db: Db):
    rows = (
        await db.scalars(
            select(ContributionCompany).order_by(
                ContributionCompany.tier.asc(), ContributionCompany.name.asc()
            )
        )
    ).all()
    return [
        {"id": row.id, "name": row.name, "shortName": row.short_name, "tier": row.tier}
        for row in rows
    ]


@router.get("/contributions/topics")
async def contribution_topics(db: Db):
    return list(
        await db.scalars(
            select(ContributionTopic.topic_label).order_by(
                ContributionTopic.question_count.desc(), ContributionTopic.id.asc()
            )
        )
    )


@router.get("/contributions/stats")
async def contribution_stats(db: Db):
    now = datetime.now(UTC)
    month_start = datetime(now.year, now.month, 1)
    values = []
    for query in (
        select(func.count(Contribution.id)).where(Contribution.verified.is_(True)),
        select(func.count(ContributionQuestion.id)),
        select(func.count(ContributionCompany.id)),
        select(func.count(ContributionTopic.id)),
        select(func.count(Contribution.id)).where(Contribution.verified.is_(False)),
        select(func.count(Contribution.id)).where(Contribution.created_at >= month_start),
    ):
        values.append(await db.scalar(query) or 0)
    return dict(
        zip(
            (
                "totalContributions",
                "totalQuestions",
                "totalCompanies",
                "totalTopics",
                "pendingReview",
                "thisMonthContributions",
            ),
            values,
            strict=True,
        )
    )


@router.get("/contributions/{contribution_id}")
async def get_contribution(contribution_id: int, db: Db):
    row = await db.scalar(
        select(Contribution).options(*contribution_load()).where(Contribution.id == contribution_id)
    )
    if not row:
        raise BusinessError(404, "面经不存在")
    await db.execute(
        update(Contribution)
        .where(Contribution.id == contribution_id)
        .values(view_count=func.coalesce(Contribution.view_count, 0) + 1)
        .execution_options(synchronize_session=False)
    )
    await db.commit()
    await db.refresh(row, attribute_names=["view_count"])
    return contribution_detail(row)


@router.post("/contributions/{contribution_id}/helpful")
async def mark_contribution_helpful(contribution_id: int, db: Db):
    result = await db.execute(
        update(Contribution)
        .where(Contribution.id == contribution_id)
        .values(helpful_count=func.coalesce(Contribution.helpful_count, 0) + 1)
    )
    if result.rowcount == 0:
        raise BusinessError(404, "面经不存在")
    await db.commit()
    return {"success": True, "message": "感谢您的认可！"}


@router.post("/auth/login")
async def login(body: LoginRequest, db: Db, request: Request):
    user = await db.scalar(select(AppUser).where(AppUser.username == body.username))
    if not user or not user.enabled or not password_hash.verify(body.password, user.password_hash):
        raise BusinessError(401, "用户名或密码错误")
    return ok(
        {
            "token": create_token(user.id, user.username, settings(request)),
            "username": user.username,
            "nickname": user.nickname,
            "role": user.role,
        }
    )


@router.post("/auth/register")
async def register(body: RegisterRequest, db: Db, request: Request):
    if await db.scalar(select(AppUser.id).where(AppUser.username == body.username)):
        raise BusinessError(1002, "用户名已存在")
    user = AppUser(
        username=body.username,
        nickname=body.nickname,
        password_hash=password_hash.hash(body.password),
        role="USER",
        enabled=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return ok(
        {
            "token": create_token(user.id, user.username, settings(request)),
            "username": user.username,
            "nickname": user.nickname,
            "role": user.role,
        }
    )


@router.get("/auth/me")
async def me(user: Annotated[AppUser, Depends(current_user)]):
    return ok(as_dict(user, "id", "username", "nickname", "role"))


@router.post("/auth/logout")
async def logout():
    return ok({"success": True})


def extract_text(data: bytes, filename: str) -> str:
    suffix = Path(filename).suffix.lower()
    try:
        if suffix == ".pdf":
            return "\n".join(
                page.extract_text() or "" for page in PdfReader(io.BytesIO(data)).pages
            )
        if suffix == ".docx":
            return "\n".join(p.text for p in Document(io.BytesIO(data)).paragraphs)
        if suffix in {".txt", ".md"}:
            return data.decode("utf-8-sig")
    except Exception as exc:
        raise BusinessError(2002, f"文件解析失败: {exc}") from exc
    raise BusinessError(2002, "仅支持 PDF、DOCX、TXT 和 Markdown 文件")


async def unique_resume_filename(db: AsyncSession, filename: str) -> str:
    safe_name = Path(filename or "resume").name
    path = Path(safe_name)
    existing_names = set((await db.scalars(select(Resume.original_filename))).all())
    if safe_name not in existing_names:
        return safe_name
    index = 1
    while True:
        candidate = f"{path.stem}（{index}）{path.suffix}"
        if candidate not in existing_names:
            return candidate
        index += 1


async def store_file(data: bytes, key: str, config: Settings, content_type: str | None) -> str:
    if not all(
        (config.app_storage_endpoint, config.app_storage_access_key, config.app_storage_secret_key)
    ):
        raise BusinessError(4001, "对象存储未配置")
    client = boto3.client(
        "s3",
        endpoint_url=config.app_storage_endpoint,
        aws_access_key_id=config.app_storage_access_key,
        aws_secret_access_key=config.app_storage_secret_key,
        region_name=config.app_storage_region,
    )
    try:
        await asyncio.to_thread(
            client.put_object,
            Bucket=config.app_storage_bucket,
            Key=key,
            Body=data,
            ContentType=content_type or "application/octet-stream",
        )
        return f"{config.app_storage_endpoint.rstrip('/')}/{config.app_storage_bucket}/{key}"
    except Exception:
        local_path = (config.app_storage_local_dir / key).resolve()
        storage_root = config.app_storage_local_dir.resolve()
        if storage_root not in local_path.parents:
            raise BusinessError(4001, "对象存储文件路径无效") from None
        await asyncio.to_thread(local_path.parent.mkdir, parents=True, exist_ok=True)
        await asyncio.to_thread(local_path.write_bytes, data)
        return f"/api/resumes/files/{quote(key, safe='/')}"


async def grade_resume(text: str, config: Settings | Request) -> dict:
    if not isinstance(config, Settings):
        config = settings(config)
    client = OpenAIClient(config.ai_base_url, config.ai_bailian_api_key, config.ai_model)
    schema = RawAnalysis.model_json_schema()
    prompt = build_resume_analysis_prompt(text)
    last_error: Exception | None = None
    for _attempt in range(2):
        try:
            raw, usage = await client.complete_json_with_usage(
                [{"role": "user", "content": prompt}], schema
            )
            parsed = RawAnalysis.model_validate(raw)
            anchored = [
                suggestion
                for suggestion in parsed.suggestions
                if suggestion.color in {"red", "blue"}
                and suggestion.resume_text
                and suggestion.resume_text in text
            ]
            if len(text.strip()) >= 120 and parsed.suggestions and not anchored:
                raise ValueError("long resume analysis returned no source-anchored suggestions")
            result = compute_analysis(parsed)
            result["metadata"] = {
                "provider": "dashscope",
                "model": config.ai_model,
                "version": "job-agent-v1",
                "tokenUsage": usage,
            }
            return result
        except Exception as exc:
            last_error = exc
    message = last_error.message if isinstance(last_error, BusinessError) else str(last_error)
    raise BusinessError(7003, f"简历分析失败（重试后）: {message}") from last_error


async def analyze_resume_in_background(
    resume_id: int,
    text: str,
    config: Settings,
    session_factory: Any,
    analysis_mode: str = "GENERAL",
    job_title: str | None = None,
    company_name: str | None = None,
    jd_text: str | None = None,
) -> None:
    async with session_factory() as session:
        try:
            row = await session.get(Resume, resume_id)
            if not row:
                return
            row.analyze_status, row.analyze_error = "PROCESSING", None
            await session.commit()
            result = await grade_resume(text, config)
            for attempt in range(2):
                try:
                    async with session_factory() as result_session:
                        result_session.add(
                            analysis_record(
                                resume_id,
                                result,
                                analysis_mode=analysis_mode,
                                job_title=job_title,
                                company_name=company_name,
                                jd_text=jd_text,
                            )
                        )
                        row = await result_session.get(Resume, resume_id)
                        if row:
                            row.analyze_status, row.analyze_error = "COMPLETED", None
                        await result_session.commit()
                    break
                except Exception:
                    if attempt == 1:
                        raise
        except BusinessError as exc:
            await session.rollback()
            row = await session.get(Resume, resume_id)
            if row:
                row.analyze_status, row.analyze_error = "FAILED", exc.message[:500]
                await session.commit()
        except Exception as exc:
            await session.rollback()
            row = await session.get(Resume, resume_id)
            if row:
                row.analyze_status, row.analyze_error = "FAILED", str(exc)[:500]
                await session.commit()


def analysis_record(
    resume_id: int,
    result: dict,
    *,
    analysis_mode: str = "GENERAL",
    job_title: str | None = None,
    company_name: str | None = None,
    jd_text: str | None = None,
) -> ResumeAnalysis:
    dims = result["scoring"]["dimensions"]
    metadata = result.get("metadata") or {}
    usage = metadata.get("tokenUsage") or {}
    return ResumeAnalysis(
        resume_id=resume_id,
        overall_score=result["scoring"]["total_score"],
        content_score=dims["completeness"]["score"],
        structure_score=dims["clarity"]["score"],
        skill_match_score=dims["persuasiveness"]["score"],
        expression_score=dims["professionalism"]["score"],
        project_score=0,
        summary=result["scoring"]["one_line_summary"],
        strengths_json=json.dumps(
            result.get("candidate_profile", {}).get("highlights", []), ensure_ascii=False
        ),
        suggestions_json=json.dumps(result["suggestions"], ensure_ascii=False),
        full_result_json=result,
        candidate_profile_json=result.get("candidate_profile"),
        style_detection_json=result.get("style_detection"),
        grade=result["scoring"].get("grade"),
        provider=metadata.get("provider"),
        model=metadata.get("model"),
        analysis_version=metadata.get("version", "job-agent-v1"),
        prompt_tokens=usage.get("prompt_tokens"),
        completion_tokens=usage.get("completion_tokens"),
        total_tokens=usage.get("total_tokens"),
        analysis_mode=analysis_mode,
        job_title=job_title,
        company_name=company_name,
        jd_text=jd_text,
    )


def legacy_analysis(analysis: ResumeAnalysis | None, text: str = "") -> dict | None:
    if not analysis:
        return None
    value = {
        "overallScore": analysis.overall_score or 0,
        "scoreDetail": {
            "contentScore": analysis.content_score or 0,
            "structureScore": analysis.structure_score or 0,
            "skillMatchScore": analysis.skill_match_score or 0,
            "expressionScore": analysis.expression_score or 0,
            "projectScore": analysis.project_score or 0,
        },
        "summary": analysis.summary or "",
        "strengths": json.loads(analysis.strengths_json or "[]"),
        "suggestions": json.loads(analysis.suggestions_json or "[]"),
        "originalText": text,
    }
    if analysis.full_result_json:
        value.update(
            fullResult=analysis.full_result_json,
            candidateProfile=analysis.candidate_profile_json,
            styleDetection=analysis.style_detection_json,
            grade=analysis.grade,
            provider=analysis.provider,
            model=analysis.model,
            version=analysis.analysis_version,
            tokenUsage={
                "promptTokens": analysis.prompt_tokens or 0,
                "completionTokens": analysis.completion_tokens or 0,
                "totalTokens": analysis.total_tokens or 0,
            },
        )
    job_match = analysis.job_match_result_json
    if isinstance(job_match, dict):
        annotations = job_match.get("annotations") or []
        normalized_score = match_score_from_annotations(annotations)
        if normalized_score is not None:
            normalized_grade = grade_from_match_score(normalized_score)
            job_match = {
                **job_match,
                "score": normalized_score,
                "grade": normalized_grade,
                "verdict": GRADE_VERDICT[normalized_grade],
            }
    value.update(
        analysisMode=analysis.analysis_mode,
        jobTitle=analysis.job_title,
        companyName=analysis.company_name,
        jdText=analysis.jd_text,
        jobMatchResult=job_match,
    )
    return value


@router.post("/resumes/upload")
async def upload_resume(
    request: Request,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    analysis_mode: str = Form("GENERAL"),
    job_title: str | None = Form(None),
    company_name: str | None = Form(None),
    jd_text: str | None = Form(None),
    db: AsyncSession = Depends(get_db),
):
    analysis_mode = analysis_mode.strip().upper()
    if analysis_mode not in {"GENERAL", "CUSTOM_JD"}:
        raise BusinessError(400, "暂不支持该简历分析模式")
    if analysis_mode == "CUSTOM_JD":
        if not job_title or not job_title.strip():
            raise BusinessError(400, "自定义 JD 分析必须填写岗位名称")
        if not jd_text or len(jd_text.strip()) < 50:
            raise BusinessError(400, "自定义 JD 正文至少需要 50 字")
        job_title = job_title.strip()
        company_name = company_name.strip() if company_name else None
        jd_text = jd_text.strip()
    data = await file.read()
    if not data or len(data) > 10 * 1024 * 1024:
        raise BusinessError(2002, "简历不能为空且不得超过10MB")
    digest = hashlib.sha256(data).hexdigest()
    duplicate_content = (
        await db.scalar(select(Resume.id).where(Resume.file_hash == digest)) is not None
    )
    display_name = await unique_resume_filename(db, file.filename or "resume")
    upload_id = uuid.uuid4().hex
    record_hash = (
        hashlib.sha256(f"{digest}:{upload_id}".encode()).hexdigest()
        if duplicate_content
        else digest
    )
    text = extract_text(data, display_name)
    key = f"resumes/{upload_id}/{display_name}"
    url = await store_file(data, key, settings(request), file.content_type)
    resume = Resume(
        file_hash=record_hash,
        original_filename=display_name,
        file_size=len(data),
        content_type=file.content_type,
        storage_key=key,
        storage_url=url,
        resume_text=text,
        analyze_status="PENDING",
    )
    db.add(resume)
    await db.flush()
    await db.commit()
    background_tasks.add_task(
        analyze_resume_in_background,
        resume.id,
        text,
        settings(request),
        request.app.state.session_factory,
        analysis_mode,
        job_title,
        company_name,
        jd_text,
    )
    return ok(
        {
            "analysis": None,
            "storage": {"fileKey": key, "fileUrl": url, "resumeId": resume.id},
            "duplicate": duplicate_content,
            "filename": display_name,
            "status": "UPLOADED",
        }
    )


@router.get("/resumes/health")
async def resume_health():
    return ok({"status": "UP", "service": "resume-service"})


@router.get("/resumes/files/{storage_key:path}")
async def read_resume_file(storage_key: str, request: Request):
    config = settings(request)
    local_path = (config.app_storage_local_dir / storage_key).resolve()
    storage_root = config.app_storage_local_dir.resolve()
    if storage_root not in local_path.parents or not local_path.is_file():
        raise BusinessError(2001, "简历文件不存在")
    content_type = {
        ".pdf": "application/pdf",
        ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ".txt": "text/plain; charset=utf-8",
        ".md": "text/markdown; charset=utf-8",
    }.get(local_path.suffix.lower(), "application/octet-stream")
    content = await asyncio.to_thread(local_path.read_bytes)
    return Response(content=content, media_type=content_type)


@router.get("/resumes/statistics")
async def resume_stats(db: Db):
    total = await db.scalar(select(func.count(Resume.id))) or 0
    interview_total = await db.scalar(select(func.count(InterviewSession.id))) or 0
    access_total = await db.scalar(select(func.coalesce(func.sum(Resume.access_count), 0))) or 0
    return ok(
        {
            "totalCount": total,
            "totalInterviewCount": interview_total,
            "totalAccessCount": access_total,
        }
    )


@router.get("/resumes")
async def list_resumes(db: Db):
    rows = (
        await db.scalars(
            select(Resume)
            .options(selectinload(Resume.analyses))
            .order_by(Resume.uploaded_at.desc())
        )
    ).all()
    interview_counts = dict(
        (
            await db.execute(
                select(InterviewSession.resume_id, func.count(InterviewSession.id))
                .where(InterviewSession.resume_id.is_not(None))
                .group_by(InterviewSession.resume_id)
            )
        ).all()
    )
    return ok(
        [
            {
                "id": r.id,
                "filename": r.original_filename,
                "fileSize": r.file_size,
                "uploadedAt": r.uploaded_at,
                "accessCount": r.access_count,
                "latestScore": max(
                    r.analyses, key=lambda analysis: analysis.analyzed_at
                ).overall_score
                if r.analyses
                else None,
                "lastAnalyzedAt": max(
                    (analysis.analyzed_at for analysis in r.analyses), default=None
                ),
                "interviewCount": interview_counts.get(r.id, 0),
                "analyzeStatus": r.analyze_status,
                "analyzeError": r.analyze_error,
                "storageUrl": r.storage_url,
            }
            for r in rows
        ]
    )


async def get_resume_or_error(db: AsyncSession, resume_id: int) -> Resume:
    row = await db.scalar(
        select(Resume).options(selectinload(Resume.analyses)).where(Resume.id == resume_id)
    )
    if not row:
        raise BusinessError(2001, "简历不存在")
    return row


@router.get("/resumes/{resume_id}/detail")
async def resume_detail(resume_id: int, db: Db):
    row = await get_resume_or_error(db, resume_id)
    interviews = (
        await db.scalars(
            select(InterviewSession)
            .where(InterviewSession.resume_id == resume_id)
            .order_by(InterviewSession.created_at.desc())
        )
    ).all()
    return ok(
        {
            "id": row.id,
            "filename": row.original_filename,
            "fileSize": row.file_size,
            "contentType": row.content_type,
            "storageUrl": row.storage_url,
            "uploadedAt": row.uploaded_at,
            "accessCount": row.access_count,
            "resumeText": row.resume_text or "",
            "analyzeStatus": row.analyze_status,
            "analyzeError": row.analyze_error,
            "analyses": [
                {
                    **legacy_analysis(analysis, row.resume_text or ""),
                    "id": analysis.id,
                    "analyzedAt": analysis.analyzed_at,
                }
                for analysis in sorted(
                    row.analyses, key=lambda item: item.analyzed_at, reverse=True
                )
            ],
            "interviews": [
                {
                    "id": interview.id,
                    "sessionId": interview.session_id,
                    "totalQuestions": interview.total_questions,
                    "status": interview.status,
                    "evaluateStatus": interview.evaluate_status,
                    "evaluateError": interview.evaluate_error,
                    "overallScore": interview.overall_score,
                    "overallFeedback": interview.overall_feedback,
                    "createdAt": interview.created_at,
                    "completedAt": interview.completed_at,
                }
                for interview in interviews
            ],
        }
    )


@router.get("/resumes/{resume_id}/export")
async def export_resume(resume_id: int, db: Db):
    row = await get_resume_or_error(db, resume_id)
    if not row.analyses:
        raise BusinessError(2003, "简历分析不存在")
    analysis = max(row.analyses, key=lambda item: item.analyzed_at)
    try:
        content = resume_pdf(row, analysis)
    except Exception as exc:
        raise BusinessError(5001, f"导出PDF失败: {exc}") from exc
    return raw_pdf(content, f"简历分析报告_{row.original_filename}.pdf")


@router.delete("/resumes/{resume_id}")
async def delete_resume(resume_id: int, db: Db):
    row = await get_resume_or_error(db, resume_id)
    # 面试记录按模型语义保留，仅解除对简历的外键引用（模型声明 ondelete="SET NULL"，
    # 但遗留数据库外键为 NO ACTION，需显式置空，否则删除简历会触发外键冲突）
    await db.execute(
        update(InterviewSession)
        .where(InterviewSession.resume_id == resume_id)
        .values(resume_id=None)
    )
    # db.delete(row) 会经 ORM relationship 级联删除 resume_analyses；
    # match_results 由数据库 ondelete="CASCADE" 自动清理。
    await db.delete(row)
    await db.commit()
    return ok()


@router.post("/resumes/{resume_id}/reanalyze")
async def reanalyze(
    resume_id: int, background_tasks: BackgroundTasks, db: Db, request: Request
):
    row = await get_resume_or_error(db, resume_id)
    row.analyze_status, row.analyze_error = "PROCESSING", None
    await db.commit()
    background_tasks.add_task(
        analyze_resume_in_background,
        row.id,
        row.resume_text or "",
        settings(request),
        request.app.state.session_factory,
    )
    return ok({"status": "PROCESSING"})


@router.get("/resumes/{resume_id}/analyses")
async def resume_analysis_history(resume_id: int, db: Db):
    row = await get_resume_or_error(db, resume_id)
    return ok(
        [
            {
                **legacy_analysis(item, row.resume_text or ""),
                "id": item.id,
                "analyzedAt": item.analyzed_at,
            }
            for item in sorted(row.analyses, key=lambda value: value.analyzed_at, reverse=True)
        ]
    )


@router.get("/resumes/{resume_id}/analyses/{analysis_id}")
async def resume_analysis_detail(resume_id: int, analysis_id: int, db: Db):
    row = await get_resume_or_error(db, resume_id)
    analysis = next((item for item in row.analyses if item.id == analysis_id), None)
    if not analysis:
        raise BusinessError(2003, "简历分析不存在")
    return ok(
        {
            **legacy_analysis(analysis, row.resume_text or ""),
            "id": analysis.id,
            "analyzedAt": analysis.analyzed_at,
        }
    )


SKILLS_PATH = Path(__file__).parent / "resources" / "skills.json"


def skills() -> list[dict]:
    return json.loads(SKILLS_PATH.read_text(encoding="utf-8"))


@router.get("/interview/skills")
async def list_skills():
    return ok(skills())


@router.get("/interview/skills/{skill_id}")
async def get_skill(skill_id: str):
    value = next((s for s in skills() if s["id"] == skill_id), None)
    if not value:
        raise BusinessError(3004, "面试技能不存在")
    return ok(value)


@router.post("/interview/skills/parse-jd")
async def parse_jd(body: dict):
    text = str(body.get("jdText", ""))
    if not text.strip():
        raise BusinessError(400, "JD内容不能为空")
    keywords = re.findall(r"[A-Za-z][A-Za-z0-9+#.-]{1,30}", text)
    unique = list(dict.fromkeys(x.lower() for x in keywords))[:8]
    return ok(
        [
            {"key": x, "label": x, "priority": "CORE" if i < 3 else "NORMAL"}
            for i, x in enumerate(unique)
        ]
    )


def schedule_data(row: InterviewSchedule) -> dict:
    return as_dict(
        row,
        "id",
        "company_name",
        "position",
        "interview_time",
        "interview_type",
        "meeting_link",
        "round_number",
        "interviewer",
        "notes",
        "status",
        "created_at",
        "updated_at",
    )


@router.post("/interview-schedule")
async def create_schedule(body: ScheduleRequest, db: Db):
    row = InterviewSchedule(**body.model_dump())
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return ok(schedule_data(row))


@router.get("/interview-schedule")
async def list_schedule(db: Db, startDate: datetime | None = None, endDate: datetime | None = None):
    query = select(InterviewSchedule)
    if startDate:
        query = query.where(InterviewSchedule.interview_time >= startDate)
    if endDate:
        query = query.where(InterviewSchedule.interview_time <= endDate)
    rows = (await db.scalars(query.order_by(InterviewSchedule.interview_time))).all()
    return ok([schedule_data(x) for x in rows])


async def get_schedule(db: AsyncSession, item_id: int):
    row = await db.get(InterviewSchedule, item_id)
    if not row:
        raise BusinessError(9001, "面试日程不存在")
    return row


@router.get("/interview-schedule/{item_id}")
async def schedule_detail(item_id: int, db: Db):
    return ok(schedule_data(await get_schedule(db, item_id)))


@router.put("/interview-schedule/{item_id}")
async def update_schedule(item_id: int, body: ScheduleRequest, db: Db):
    row = await get_schedule(db, item_id)
    for key, value in body.model_dump().items():
        setattr(row, key, value)
    await db.commit()
    await db.refresh(row)
    return ok(schedule_data(row))


@router.delete("/interview-schedule/{item_id}")
async def remove_schedule(item_id: int, db: Db):
    await db.delete(await get_schedule(db, item_id))
    await db.commit()
    return ok()


@router.patch("/interview-schedule/{item_id}/status")
@router.put("/interview-schedule/{item_id}/status", include_in_schema=False)
async def schedule_status(item_id: int, body: StatusRequest, db: Db):
    row = await get_schedule(db, item_id)
    row.status = body.status
    await db.commit()
    await db.refresh(row)
    return ok(schedule_data(row))


@router.post("/interview-schedule/parse")
async def parse_schedule(body: dict):
    text = str(body.get("rawText", ""))
    date_match = re.search(r"(20\d{2}[-/]\d{1,2}[-/]\d{1,2})\s+(\d{1,2}:\d{2})", text)
    if not date_match:
        return ok(
            {
                "success": False,
                "data": None,
                "confidence": 0,
                "parseMethod": "rule",
                "log": "未识别到日期时间",
            }
        )
    dt = datetime.fromisoformat(f"{date_match.group(1).replace('/', '-')}T{date_match.group(2)}")
    return ok(
        {
            "success": True,
            "data": {
                "companyName": "待确认",
                "position": "待确认",
                "interviewTime": dt,
                "roundNumber": 1,
            },
            "confidence": 0.5,
            "parseMethod": "rule",
            "log": "规则解析成功",
        }
    )


async def active_client(
    db: AsyncSession, request: Request, provider_id: str | None = None
) -> OpenAIClient:
    if provider_id:
        provider = await db.get(LlmProvider, provider_id)
        if not provider:
            raise BusinessError(7001, f"AI Provider不存在: {provider_id}")
        api_key = decrypt_secret(
            provider.api_key_ciphertext,
            provider.api_key_nonce,
            settings(request).jwt_secret,
        )
        return OpenAIClient(provider.base_url, api_key, provider.model)
    config = settings(request)
    return OpenAIClient(config.ai_base_url, config.ai_bailian_api_key, config.ai_model)


async def evaluation_client(
    db: AsyncSession, config: Settings, provider_id: str | None
) -> OpenAIClient:
    if provider_id and provider_id != "dashscope":
        provider = await db.get(LlmProvider, provider_id)
        if not provider:
            raise BusinessError(7001, f"AI Provider不存在: {provider_id}")
        api_key = decrypt_secret(
            provider.api_key_ciphertext,
            provider.api_key_nonce,
            config.jwt_secret,
        )
        return OpenAIClient(provider.base_url, api_key, provider.model)
    return OpenAIClient(config.ai_base_url, config.ai_bailian_api_key, config.ai_model)


def build_interview_evaluation_prompt(records: list[dict[str, Any]]) -> str:
    return """你是一名严格、客观的技术面试官。请评估以下已回答的面试题。

评分维度：准确性40%、完整性20%、深度25%、表达15%。
要求：
- 每个 questionIndex 必须且只能出现一次。
- score 为 0-100 的整数；不知道、跳过、无实质内容必须为0分。
- feedback 必须具体指出正确点、错误点和遗漏点。
- referenceAnswer 给出准确、可学习的参考答案，keyPoints 给出核心知识点。
- strengths 和 improvements 必须基于实际回答，不得编造。
- 不要输出总分，总分由系统按全部题目计算。

问答记录：
""" + json.dumps(records, ensure_ascii=False)


async def evaluate_text_session_task(session_id: str, session_factory, config: Settings) -> None:
    async with session_factory() as db:
        try:
            row = await text_session(db, session_id, True)
            questions = json.loads(row.questions_json or "[]")
            answer_map = {answer.question_index: answer for answer in row.answers}
            answered_records = []
            for index, question in enumerate(questions):
                answer = answer_map.get(index)
                if not answer:
                    answer = InterviewAnswer(
                        session_id=row.id,
                        question_index=index,
                        question=question.get("question", ""),
                        category=question.get("category", "综合"),
                        user_answer="",
                    )
                    db.add(answer)
                    answer_map[index] = answer
                if answer.user_answer and answer.user_answer.strip():
                    answered_records.append(
                        {
                            "questionIndex": index,
                            "question": answer.question,
                            "category": answer.category or "综合",
                            "userAnswer": answer.user_answer,
                        }
                    )

            report = None
            if answered_records:
                client = await evaluation_client(db, config, row.llm_provider)
                raw = await client.complete_json(
                    [
                        {
                            "role": "user",
                            "content": build_interview_evaluation_prompt(answered_records),
                        }
                    ],
                    InterviewEvaluationResult.model_json_schema(),
                )
                report = InterviewEvaluationResult.model_validate(raw)

            evaluations = {
                item.question_index: item
                for item in (report.question_evaluations if report else [])
            }
            reference_answers = []
            total_score = 0
            for index in range(len(questions)):
                answer = answer_map[index]
                evaluation = evaluations.get(index)
                if evaluation and answer.user_answer and answer.user_answer.strip():
                    answer.score = evaluation.score
                    answer.feedback = evaluation.feedback
                    answer.reference_answer = evaluation.reference_answer
                    answer.key_points_json = json.dumps(evaluation.key_points, ensure_ascii=False)
                else:
                    answer.score = 0
                    answer.feedback = "该题未作答或未生成有效评估，按0分处理。"
                    answer.reference_answer = ""
                    answer.key_points_json = "[]"
                total_score += answer.score or 0
                reference_answers.append(
                    {
                        "questionIndex": index,
                        "question": answer.question,
                        "referenceAnswer": answer.reference_answer or "",
                        "keyPoints": json.loads(answer.key_points_json or "[]"),
                    }
                )

            row.overall_score = round(total_score / len(questions)) if questions else 0
            row.overall_feedback = (
                report.overall_feedback
                if report
                else "本次面试没有有效回答，暂时无法评估技术能力。"
            )
            row.strengths_json = json.dumps(report.strengths if report else [], ensure_ascii=False)
            row.improvements_json = json.dumps(
                report.improvements if report else ["建议完整回答问题后再进行评估。"],
                ensure_ascii=False,
            )
            row.reference_answers_json = json.dumps(reference_answers, ensure_ascii=False)
            row.evaluate_status, row.evaluate_error, row.status = "COMPLETED", None, "EVALUATED"
            await db.commit()
        except Exception as exc:
            await db.rollback()
            row = await db.scalar(
                select(InterviewSession).where(InterviewSession.session_id == session_id)
            )
            if row:
                message = exc.message if isinstance(exc, BusinessError) else str(exc)
                row.evaluate_status = "FAILED"
                row.evaluate_error = message[:500]
                await db.commit()


async def schedule_text_evaluation(
    row: InterviewSession,
    db: AsyncSession,
    request: Request,
    background_tasks: BackgroundTasks,
) -> None:
    row.status = "COMPLETED"
    row.completed_at = row.completed_at or utc_now()
    row.evaluate_status, row.evaluate_error = "PROCESSING", None
    await db.commit()
    background_tasks.add_task(
        evaluate_text_session_task,
        row.session_id,
        request.app.state.session_factory,
        settings(request),
    )


def interview_data(
    row: InterviewSession, answers: list[InterviewAnswer] | None = None, resume_text: str = ""
) -> dict:
    answer_map = {a.question_index: a for a in answers or []}
    questions = []
    for index, question in enumerate(json.loads(row.questions_json or "[]")):
        answer = answer_map.get(index)
        questions.append(
            {
                "questionIndex": index,
                "question": question.get("question", ""),
                "type": question.get("type", "TECHNICAL"),
                "category": question.get("category", "general"),
                "userAnswer": answer.user_answer if answer else None,
                "score": answer.score if answer else None,
                "feedback": answer.feedback if answer else None,
            }
        )
    return {
        "sessionId": row.session_id,
        "resumeText": resume_text,
        "totalQuestions": row.total_questions,
        "currentQuestionIndex": row.current_question_index,
        "questions": questions,
        "status": row.status,
    }


async def text_session(
    db: AsyncSession, session_id: str, load_answers: bool = False
) -> InterviewSession:
    query = select(InterviewSession).where(InterviewSession.session_id == session_id)
    if load_answers:
        query = query.options(selectinload(InterviewSession.answers))
    row = await db.scalar(query)
    if not row:
        raise BusinessError(3001, "面试会话不存在")
    return row


@router.get("/interview/sessions")
async def list_text_sessions(db: Db):
    rows = (
        await db.scalars(select(InterviewSession).order_by(InterviewSession.created_at.desc()))
    ).all()
    return ok(
        [
            {
                "sessionId": r.session_id,
                "skillId": r.skill_id,
                "difficulty": r.difficulty,
                "resumeId": r.resume_id,
                "totalQuestions": r.total_questions,
                "status": r.status,
                "evaluateStatus": r.evaluate_status,
                "evaluateError": r.evaluate_error,
                "overallScore": r.overall_score,
                "createdAt": r.created_at,
                "completedAt": r.completed_at,
            }
            for r in rows
        ]
    )


@router.post("/interview/sessions")
async def create_text_session(body: CreateTextInterview, db: Db, request: Request):
    if body.resume_id and not body.force_create:
        unfinished = await db.scalar(
            select(InterviewSession)
            .where(
                InterviewSession.resume_id == body.resume_id,
                InterviewSession.status.in_(["CREATED", "IN_PROGRESS"]),
            )
            .order_by(InterviewSession.created_at.desc())
        )
        if unfinished:
            return ok(interview_data(unfinished, resume_text=body.resume_text))
    client = await active_client(db, request, body.llm_provider)
    schema = {
        "type": "object",
        "additionalProperties": False,
        "required": ["questions"],
        "properties": {
            "questions": {
                "type": "array",
                "minItems": body.question_count,
                "maxItems": body.question_count,
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": ["question", "type", "category"],
                    "properties": {
                        "question": {"type": "string"},
                        "type": {"type": "string"},
                        "category": {"type": "string"},
                    },
                },
            }
        },
    }
    prompt = (
        f"生成{body.question_count}道{body.difficulty}难度的{body.skill_id}面试题。"
        f"只返回JSON。简历：\n{body.resume_text}\nJD：{body.jd_text or ''}"
    )
    generated = await client.complete_json([{"role": "user", "content": prompt}], schema)
    questions = generated.get("questions")
    if not isinstance(questions, list) or len(questions) != body.question_count:
        raise BusinessError(7004, "AI返回的面试题数量不正确")
    row = InterviewSession(
        session_id=str(uuid.uuid4()),
        skill_id=body.skill_id,
        difficulty=body.difficulty,
        resume_id=body.resume_id,
        total_questions=len(questions),
        current_question_index=0,
        status="IN_PROGRESS",
        questions_json=json.dumps(questions, ensure_ascii=False),
        llm_provider=body.llm_provider or "dashscope",
    )
    db.add(row)
    await db.commit()
    return ok(interview_data(row, resume_text=body.resume_text))


@router.get("/interview/sessions/unfinished/{resume_id}")
async def unfinished_session(resume_id: int, db: Db):
    row = await db.scalar(
        select(InterviewSession)
        .where(
            InterviewSession.resume_id == resume_id,
            InterviewSession.status.in_(["CREATED", "IN_PROGRESS"]),
        )
        .order_by(InterviewSession.created_at.desc())
    )
    if not row:
        raise BusinessError(3001, "没有未完成的面试")
    return ok(interview_data(row))


@router.get("/interview/sessions/{session_id}")
async def get_text_session(session_id: str, db: Db):
    row = await text_session(db, session_id, True)
    return ok(interview_data(row, row.answers))


@router.get("/interview/sessions/{session_id}/details")
async def get_text_session_details(session_id: str, db: Db):
    row = await text_session(db, session_id, True)
    questions = json.loads(row.questions_json or "[]")
    answers = sorted(row.answers, key=lambda answer: answer.question_index)
    return ok(
        {
            "id": row.id,
            "sessionId": row.session_id,
            "totalQuestions": row.total_questions,
            "status": row.status,
            "evaluateStatus": row.evaluate_status,
            "evaluateError": row.evaluate_error,
            "overallScore": row.overall_score,
            "overallFeedback": row.overall_feedback,
            "createdAt": row.created_at,
            "completedAt": row.completed_at,
            "questions": questions,
            "strengths": json.loads(row.strengths_json or "[]"),
            "improvements": json.loads(row.improvements_json or "[]"),
            "referenceAnswers": json.loads(row.reference_answers_json or "[]"),
            "answers": [
                {
                    "questionIndex": answer.question_index,
                    "question": answer.question,
                    "category": answer.category or "综合",
                    "userAnswer": answer.user_answer or "",
                    "score": answer.score,
                    "feedback": answer.feedback or "",
                    "referenceAnswer": answer.reference_answer,
                    "keyPoints": json.loads(answer.key_points_json or "[]"),
                    "answeredAt": answer.answered_at,
                }
                for answer in answers
            ],
        }
    )


@router.get("/interview/sessions/{session_id}/question")
async def current_question(session_id: str, db: Db):
    row = await text_session(db, session_id, True)
    data = interview_data(row, row.answers)
    if row.current_question_index >= row.total_questions:
        return ok({"completed": True, "message": "面试已完成"})
    return ok({"completed": False, "question": data["questions"][row.current_question_index]})


async def save_text_answer(
    row: InterviewSession, body: AnswerRequest, db: AsyncSession
) -> InterviewAnswer:
    if body.question_index >= row.total_questions:
        raise BusinessError(3002, "问题索引超出范围")
    questions = json.loads(row.questions_json)
    answer = await db.scalar(
        select(InterviewAnswer).where(
            InterviewAnswer.session_id == row.id,
            InterviewAnswer.question_index == body.question_index,
        )
    )
    if not answer:
        q = questions[body.question_index]
        answer = InterviewAnswer(
            session_id=row.id,
            question_index=body.question_index,
            question=q["question"],
            category=q.get("category"),
            user_answer=body.answer,
        )
        db.add(answer)
    else:
        answer.user_answer = body.answer
    return answer


@router.put("/interview/sessions/{session_id}/answers")
async def save_answer(session_id: str, body: AnswerRequest, db: Db):
    await save_text_answer(await text_session(db, session_id), body, db)
    await db.commit()
    return ok()


@router.post("/interview/sessions/{session_id}/answers")
async def submit_answer(
    session_id: str,
    body: AnswerRequest,
    request: Request,
    background_tasks: BackgroundTasks,
    db: Db,
):
    row = await text_session(db, session_id)
    await save_text_answer(row, body, db)
    row.current_question_index = max(row.current_question_index, body.question_index + 1)
    if row.current_question_index >= row.total_questions:
        await schedule_text_evaluation(row, db, request, background_tasks)
    else:
        await db.commit()
    data = interview_data(row)
    next_question = (
        data["questions"][row.current_question_index]
        if row.current_question_index < row.total_questions
        else None
    )
    return ok(
        {
            "hasNextQuestion": next_question is not None,
            "nextQuestion": next_question,
            "currentIndex": row.current_question_index,
            "totalQuestions": row.total_questions,
        }
    )


@router.post("/interview/sessions/{session_id}/complete")
async def complete_text(
    session_id: str,
    request: Request,
    background_tasks: BackgroundTasks,
    db: Db,
):
    row = await text_session(db, session_id)
    await schedule_text_evaluation(row, db, request, background_tasks)
    return ok()


@router.post("/interview/sessions/{session_id}/evaluate")
async def retry_text_evaluation(
    session_id: str,
    request: Request,
    background_tasks: BackgroundTasks,
    db: Db,
):
    row = await text_session(db, session_id)
    if row.evaluate_status == "PROCESSING":
        return ok(message="评估正在进行中")
    await schedule_text_evaluation(row, db, request, background_tasks)
    return ok()


@router.get("/interview/sessions/{session_id}/report")
async def text_report(session_id: str, db: Db):
    row = await text_session(db, session_id, True)
    if row.evaluate_status != "COMPLETED":
        raise BusinessError(3003, "面试评估尚未完成；评估需要已配置的AI Provider")
    details = [
        {
            "questionIndex": a.question_index,
            "question": a.question,
            "category": a.category,
            "userAnswer": a.user_answer or "",
            "score": a.score or 0,
            "feedback": a.feedback or "",
        }
        for a in row.answers
    ]
    return ok(
        {
            "sessionId": row.session_id,
            "totalQuestions": row.total_questions,
            "overallScore": row.overall_score or 0,
            "categoryScores": [],
            "questionDetails": details,
            "overallFeedback": row.overall_feedback or "",
            "strengths": json.loads(row.strengths_json or "[]"),
            "improvements": json.loads(row.improvements_json or "[]"),
            "referenceAnswers": json.loads(row.reference_answers_json or "[]"),
        }
    )


@router.get("/interview/sessions/{session_id}/export")
async def export_text_interview(session_id: str, db: Db):
    row = await text_session(db, session_id, True)
    try:
        content = interview_pdf(row)
    except Exception as exc:
        raise BusinessError(5001, f"导出PDF失败: {exc}") from exc
    return raw_pdf(content, f"模拟面试报告_{session_id}.pdf")


@router.delete("/interview/sessions/{session_id}")
async def delete_text_session(session_id: str, db: Db):
    await db.delete(await text_session(db, session_id))
    await db.commit()
    return ok()


def kb_data(row: KnowledgeBase) -> dict:
    return as_dict(
        row,
        "id",
        "name",
        "category",
        "original_filename",
        "file_size",
        "content_type",
        "uploaded_at",
        "last_accessed_at",
        "access_count",
        "question_count",
        "vector_status",
        "vector_error",
        "chunk_count",
    )


async def kb_or_error(db: AsyncSession, item_id: int) -> KnowledgeBase:
    row = await db.get(KnowledgeBase, item_id)
    if not row:
        raise BusinessError(6001, "知识库不存在")
    return row


@router.post("/knowledgebase/upload")
async def upload_kb(
    request: Request,
    file: UploadFile = File(...),
    name: str | None = Form(None),
    category: str | None = Form(None),
    db: AsyncSession = Depends(get_db),
):
    data = await file.read()
    if not data or len(data) > 50 * 1024 * 1024:
        raise BusinessError(6002, "文件不能为空且不得超过50MB")
    digest = hashlib.sha256(data).hexdigest()
    existing = await db.scalar(select(KnowledgeBase).where(KnowledgeBase.file_hash == digest))
    if existing:
        return ok(
            {
                "knowledgeBase": {
                    "id": existing.id,
                    "name": existing.name,
                    "category": existing.category,
                    "fileSize": existing.file_size,
                    "contentLength": 0,
                },
                "storage": {"fileKey": existing.storage_key, "fileUrl": existing.storage_url},
                "duplicate": True,
            }
        )
    extract_text(data, file.filename or "document")
    key = f"knowledgebase/{digest}/{Path(file.filename or 'document').name}"
    url = await store_file(data, key, settings(request), file.content_type)
    row = KnowledgeBase(
        file_hash=digest,
        name=name or Path(file.filename or "document").stem,
        category=category,
        original_filename=file.filename or "document",
        file_size=len(data),
        content_type=file.content_type,
        storage_key=key,
        storage_url=url,
        vector_status="FAILED",
        vector_error="未配置向量化工作器",
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return ok(
        {
            "knowledgeBase": {
                "id": row.id,
                "name": row.name,
                "category": row.category,
                "fileSize": row.file_size,
                "contentLength": 0,
            },
            "storage": {"fileKey": key, "fileUrl": url},
            "duplicate": False,
        }
    )


@router.get("/knowledgebase/list")
async def list_kb(db: Db, sortBy: str = "time", vectorStatus: str | None = None):
    query = select(KnowledgeBase)
    if vectorStatus:
        query = query.where(KnowledgeBase.vector_status == vectorStatus)
    order = {
        "size": KnowledgeBase.file_size.desc(),
        "access": KnowledgeBase.access_count.desc(),
        "question": KnowledgeBase.question_count.desc(),
    }.get(sortBy, KnowledgeBase.uploaded_at.desc())
    return ok([kb_data(x) for x in (await db.scalars(query.order_by(order))).all()])


@router.get("/knowledgebase/categories")
async def kb_categories(db: Db):
    return ok(
        list(
            (
                await db.scalars(
                    select(KnowledgeBase.category)
                    .where(KnowledgeBase.category.is_not(None))
                    .distinct()
                )
            ).all()
        )
    )


@router.get("/knowledgebase/uncategorized")
async def uncategorized(db: Db):
    return ok(
        [
            kb_data(x)
            for x in (
                await db.scalars(
                    select(KnowledgeBase).where(
                        or_(KnowledgeBase.category.is_(None), KnowledgeBase.category == "")
                    )
                )
            ).all()
        ]
    )


@router.get("/knowledgebase/category/{category}")
async def by_category(category: str, db: Db):
    return ok(
        [
            kb_data(x)
            for x in (
                await db.scalars(select(KnowledgeBase).where(KnowledgeBase.category == category))
            ).all()
        ]
    )


@router.get("/knowledgebase/search")
async def search_kb(keyword: str, db: Db):
    return ok(
        [
            kb_data(x)
            for x in (
                await db.scalars(
                    select(KnowledgeBase).where(
                        or_(
                            KnowledgeBase.name.ilike(f"%{keyword}%"),
                            KnowledgeBase.original_filename.ilike(f"%{keyword}%"),
                        )
                    )
                )
            ).all()
        ]
    )


@router.get("/knowledgebase/stats")
async def kb_stats(db: Db):
    rows = (await db.scalars(select(KnowledgeBase))).all()
    return ok(
        {
            "totalCount": len(rows),
            "totalQuestionCount": sum(x.question_count for x in rows),
            "totalAccessCount": sum(x.access_count for x in rows),
            "completedCount": sum(x.vector_status == "COMPLETED" for x in rows),
            "processingCount": sum(x.vector_status in {"PENDING", "PROCESSING"} for x in rows),
        }
    )


@router.get("/knowledgebase/{item_id}")
async def kb_detail(item_id: int, db: Db):
    return ok(kb_data(await kb_or_error(db, item_id)))


@router.put("/knowledgebase/{item_id}/category")
async def update_kb_category(item_id: int, body: CategoryRequest, db: Db):
    row = await kb_or_error(db, item_id)
    row.category = body.category
    await db.commit()
    return ok()


@router.post("/knowledgebase/{item_id}/revectorize")
async def revectorize(item_id: int, db: Db):
    await kb_or_error(db, item_id)
    raise BusinessError(6003, "向量化工作器未配置")


@router.delete("/knowledgebase/{item_id}")
async def delete_kb(item_id: int, db: Db):
    await db.delete(await kb_or_error(db, item_id))
    await db.commit()
    return ok()


@router.get("/knowledgebase/{item_id}/download")
async def download_kb(item_id: int, db: Db, request: Request):
    row = await kb_or_error(db, item_id)
    config = settings(request)
    if not config.app_storage_endpoint:
        raise BusinessError(4001, "对象存储未配置")
    client = boto3.client(
        "s3",
        endpoint_url=config.app_storage_endpoint,
        aws_access_key_id=config.app_storage_access_key,
        aws_secret_access_key=config.app_storage_secret_key,
        region_name=config.app_storage_region,
    )
    try:
        data = await asyncio.to_thread(
            client.get_object, Bucket=config.app_storage_bucket, Key=row.storage_key
        )
    except Exception as exc:
        raise BusinessError(4002, f"文件下载失败: {exc}") from exc
    content = await asyncio.to_thread(data["Body"].read)
    return Response(
        content,
        media_type=row.content_type,
        headers={"Content-Disposition": f'attachment; filename="{row.original_filename}"'},
    )


async def rag_answer(body: QueryRequest, db: AsyncSession, request: Request):
    rows = (
        await db.scalars(select(KnowledgeBase).where(KnowledgeBase.id.in_(body.knowledge_base_ids)))
    ).all()
    if len(rows) != len(set(body.knowledge_base_ids)):
        raise BusinessError(6001, "部分知识库不存在")
    if any(x.vector_status != "COMPLETED" for x in rows):
        raise BusinessError(6003, "知识库尚未完成向量化")
    # Existing vectors use Spring AI's schema; retrieval needs an explicit compatibility adapter.
    raise BusinessError(6004, "pgvector检索适配器未配置")


@router.post("/knowledgebase/query")
async def query_kb(body: QueryRequest, db: Db, request: Request):
    return ok(await rag_answer(body, db, request))


@router.post("/knowledgebase/query/stream")
async def query_kb_stream(body: QueryRequest, db: Db, request: Request):
    await rag_answer(body, db, request)


def rag_session_data(row: RagChatSession) -> dict:
    return {
        "id": row.id,
        "title": row.title,
        "knowledgeBaseIds": [x.id for x in row.knowledge_bases],
        "createdAt": row.created_at,
    }


@router.post("/rag-chat/sessions")
async def create_rag_session(body: RagSessionRequest, db: Db):
    bases = list(
        (
            await db.scalars(
                select(KnowledgeBase).where(KnowledgeBase.id.in_(body.knowledge_base_ids))
            )
        ).all()
    )
    if len(bases) != len(set(body.knowledge_base_ids)):
        raise BusinessError(6001, "部分知识库不存在")
    row = RagChatSession(title=body.title or "新对话", knowledge_bases=bases)
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return ok(rag_session_data(row))


async def rag_session_or_error(db: AsyncSession, item_id: int) -> RagChatSession:
    row = await db.scalar(
        select(RagChatSession)
        .options(
            selectinload(RagChatSession.knowledge_bases), selectinload(RagChatSession.messages)
        )
        .where(RagChatSession.id == item_id)
    )
    if not row:
        raise BusinessError(6005, "RAG会话不存在")
    return row


@router.get("/rag-chat/sessions")
async def list_rag_sessions(db: Db):
    rows = (
        await db.scalars(
            select(RagChatSession)
            .options(selectinload(RagChatSession.knowledge_bases))
            .order_by(RagChatSession.is_pinned.desc(), RagChatSession.updated_at.desc())
        )
    ).all()
    return ok(
        [
            {
                "id": x.id,
                "title": x.title,
                "messageCount": x.message_count,
                "knowledgeBaseNames": [kb.name for kb in x.knowledge_bases],
                "updatedAt": x.updated_at,
                "isPinned": x.is_pinned,
            }
            for x in rows
        ]
    )


@router.get("/rag-chat/sessions/{item_id}")
async def rag_detail(item_id: int, db: Db):
    row = await rag_session_or_error(db, item_id)
    return ok(
        {
            "id": row.id,
            "title": row.title,
            "knowledgeBases": [kb_data(x) for x in row.knowledge_bases],
            "messages": [
                {
                    "id": m.id,
                    "type": m.type.lower(),
                    "content": m.content,
                    "createdAt": m.created_at,
                }
                for m in sorted(row.messages, key=lambda x: x.message_order)
            ],
            "createdAt": row.created_at,
            "updatedAt": row.updated_at,
        }
    )


@router.put("/rag-chat/sessions/{item_id}/title")
async def rag_title(item_id: int, body: TitleRequest, db: Db):
    row = await rag_session_or_error(db, item_id)
    row.title = body.title
    await db.commit()
    return ok()


@router.put("/rag-chat/sessions/{item_id}/pin")
async def rag_pin(item_id: int, db: Db):
    row = await rag_session_or_error(db, item_id)
    row.is_pinned = not row.is_pinned
    await db.commit()
    return ok()


@router.put("/rag-chat/sessions/{item_id}/knowledge-bases")
async def rag_bases(item_id: int, body: RagSessionRequest, db: Db):
    row = await rag_session_or_error(db, item_id)
    bases = list(
        (
            await db.scalars(
                select(KnowledgeBase).where(KnowledgeBase.id.in_(body.knowledge_base_ids))
            )
        ).all()
    )
    if len(bases) != len(set(body.knowledge_base_ids)):
        raise BusinessError(6001, "部分知识库不存在")
    row.knowledge_bases = bases
    await db.commit()
    return ok()


@router.delete("/rag-chat/sessions/{item_id}")
async def delete_rag(item_id: int, db: Db):
    await db.delete(await rag_session_or_error(db, item_id))
    await db.commit()
    return ok()


@router.post("/rag-chat/sessions/{item_id}/messages/stream")
async def rag_message_stream(item_id: int, body: dict, db: Db, request: Request):
    row = await rag_session_or_error(db, item_id)
    question = str(body.get("question", "")).strip()
    if not question:
        raise BusinessError(400, "问题不能为空")
    if any(x.vector_status != "COMPLETED" for x in row.knowledge_bases):
        raise BusinessError(6003, "知识库尚未完成向量化")
    raise BusinessError(6004, "pgvector检索适配器未配置")


def mask_key(key: str) -> str:
    if len(key) <= 8:
        return "****"
    return key[:4] + "****" + key[-4:]


async def globals_or_default(db: AsyncSession) -> LlmGlobalSetting:
    row = await db.get(LlmGlobalSetting, 1)
    if not row:
        row = LlmGlobalSetting(
            id=1, default_chat_provider_id="dashscope", default_embedding_provider_id="dashscope"
        )
        db.add(row)
        await db.flush()
    return row


async def provider_data(row: LlmProvider, db: AsyncSession) -> dict:
    global_row = await globals_or_default(db)
    return {
        "id": row.id,
        "baseUrl": row.base_url,
        "maskedApiKey": mask_key(row.api_key_ciphertext),
        "model": row.model,
        "embeddingModel": row.embedding_model,
        "embeddingDimensions": row.embedding_dimensions,
        "supportsEmbedding": row.supports_embedding,
        "temperature": row.temperature,
        "defaultChatProvider": global_row.default_chat_provider_id == row.id,
        "defaultEmbeddingProvider": global_row.default_embedding_provider_id == row.id,
    }


@router.get("/llm-provider/list")
async def providers(db: Db):
    return ok(
        [
            await provider_data(x, db)
            for x in (await db.scalars(select(LlmProvider).order_by(LlmProvider.id))).all()
        ]
    )


@router.get("/llm-provider/default-provider")
async def default_provider(db: Db):
    row = await globals_or_default(db)
    return ok(
        {
            "defaultProvider": row.default_chat_provider_id,
            "defaultEmbeddingProvider": row.default_embedding_provider_id,
        }
    )


@router.put("/llm-provider/default-provider")
async def set_default(body: DefaultProvider, db: Db):
    if not await db.get(LlmProvider, body.default_provider):
        raise BusinessError(7005, "Provider不存在")
    row = await globals_or_default(db)
    row.default_chat_provider_id = body.default_provider
    await db.commit()
    return ok()


@router.put("/llm-provider/default-embedding-provider")
async def set_embedding_default(body: DefaultProvider, db: Db):
    provider = await db.get(LlmProvider, body.default_embedding_provider)
    if not provider or not provider.supports_embedding:
        raise BusinessError(7005, "Embedding Provider不存在或不支持向量")
    row = await globals_or_default(db)
    row.default_embedding_provider_id = body.default_embedding_provider
    await db.commit()
    return ok()


@router.post("/llm-provider")
async def create_provider(body: ProviderCreate, db: Db, request: Request):
    if await db.get(LlmProvider, body.id):
        raise BusinessError(7005, "Provider已存在")
    values = body.model_dump(mode="json")
    ciphertext, nonce = encrypt_secret(values.pop("api_key"), settings(request).jwt_secret)
    values["api_key_ciphertext"] = ciphertext
    values["api_key_nonce"] = nonce
    db.add(LlmProvider(**values, enabled=True, builtin=False))
    await db.commit()
    return ok()


@router.get("/llm-provider/{provider_id}")
async def provider_detail(provider_id: str, db: Db):
    row = await db.get(LlmProvider, provider_id)
    if not row:
        raise BusinessError(7005, "Provider不存在")
    return ok(await provider_data(row, db))


@router.put("/llm-provider/{provider_id}")
async def update_provider(provider_id: str, body: ProviderUpdate, db: Db, request: Request):
    row = await db.get(LlmProvider, provider_id)
    if not row:
        raise BusinessError(7005, "Provider不存在")
    values = body.model_dump(exclude_none=True, mode="json")
    if "api_key" in values:
        ciphertext, nonce = encrypt_secret(values.pop("api_key"), settings(request).jwt_secret)
        values["api_key_ciphertext"] = ciphertext
        values["api_key_nonce"] = nonce
    for key, value in values.items():
        setattr(row, key, value)
    await db.commit()
    return ok()


@router.delete("/llm-provider/{provider_id}")
async def remove_provider(provider_id: str, db: Db):
    row = await db.get(LlmProvider, provider_id)
    if not row:
        raise BusinessError(7005, "Provider不存在")
    global_row = await globals_or_default(db)
    if provider_id in {
        global_row.default_chat_provider_id,
        global_row.default_embedding_provider_id,
    }:
        raise BusinessError(7006, "默认Provider不能删除")
    await db.delete(row)
    await db.commit()
    return ok()


@router.post("/llm-provider/{provider_id}/test")
async def test_provider(provider_id: str, db: Db, request: Request):
    row = await db.get(LlmProvider, provider_id)
    if not row:
        raise BusinessError(7005, "Provider不存在")
    api_key = decrypt_secret(
        row.api_key_ciphertext, row.api_key_nonce, settings(request).jwt_secret
    )
    await OpenAIClient(row.base_url, api_key, row.model).complete_json(
        [{"role": "user", "content": 'Return JSON: {"ok":true}'}]
    )
    return ok({"success": True, "message": "连接成功", "model": row.model})


@router.post("/llm-provider/reload")
async def reload_provider():
    return ok()


def voice_config(config: Settings, kind: str) -> dict:
    if kind == "asr":
        return {
            "url": "wss://dashscope.aliyuncs.com/api-ws/v1/realtime",
            "model": "qwen3-asr-flash-realtime",
            "maskedApiKey": mask_key(config.ai_bailian_api_key or ""),
            "language": "zh",
            "format": "pcm",
            "sampleRate": 16000,
            "enableTurnDetection": True,
            "turnDetectionType": "server_vad",
            "turnDetectionThreshold": 0,
            "turnDetectionSilenceDurationMs": 2000,
        }
    return {
        "model": "qwen3-tts-flash-realtime",
        "maskedApiKey": mask_key(config.ai_bailian_api_key or ""),
        "voice": "Cherry",
        "format": "pcm",
        "sampleRate": 24000,
        "mode": "commit",
        "languageType": "Chinese",
        "speechRate": 1,
        "volume": 60,
    }


@router.get("/llm-provider/voice/asr")
async def asr_config(request: Request):
    return ok(voice_config(settings(request), "asr"))


@router.get("/llm-provider/voice/tts")
async def tts_config(request: Request):
    return ok(voice_config(settings(request), "tts"))


@router.put("/llm-provider/voice/asr")
async def update_asr():
    raise BusinessError(10004, "Python后端暂不支持持久化ASR配置")


@router.put("/llm-provider/voice/tts")
async def update_tts():
    raise BusinessError(10004, "Python后端暂不支持持久化TTS配置")


@router.post("/llm-provider/voice/asr/test")
async def test_asr():
    raise BusinessError(10004, "实时DashScope ASR尚未接入")


def voice_data(row: VoiceSession, request: Request | None = None) -> dict:
    ws = f"/ws/voice-interview/{row.id}"
    if request:
        ws = (
            str(request.base_url)
            .replace("http://", "ws://")
            .replace("https://", "wss://")
            .rstrip("/")
            + ws
        )
    return {
        "sessionId": row.id,
        "roleType": row.role_type,
        "currentPhase": row.current_phase,
        "status": row.status,
        "startTime": row.start_time,
        "plannedDuration": row.planned_duration,
        "webSocketUrl": ws,
    }


async def voice_or_error(db: AsyncSession, item_id: int) -> VoiceSession:
    row = await db.get(VoiceSession, item_id)
    if not row:
        raise BusinessError(10001, "语音面试会话不存在")
    return row


@router.post("/voice-interview/sessions")
async def create_voice(
    body: VoiceCreate, db: Db, request: Request, user: Annotated[AppUser, Depends(current_user)]
):
    row = VoiceSession(
        user_id=str(user.id),
        **body.model_dump(exclude={"llm_provider"}),
        llm_provider=body.llm_provider or "dashscope",
        current_phase="INTRO",
        status="IN_PROGRESS",
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return ok(voice_data(row, request))


@router.get("/voice-interview/sessions")
async def list_voice(db: Db, status: str | None = None, userId: str | None = None):
    query = select(VoiceSession)
    if status:
        query = query.where(VoiceSession.status == status)
    if userId:
        query = query.where(VoiceSession.user_id == userId)
    rows = (await db.scalars(query.order_by(VoiceSession.created_at.desc()))).all()
    result = []
    for row in rows:
        count = (
            await db.scalar(
                select(func.count(VoiceMessage.id)).where(VoiceMessage.session_id == row.id)
            )
            or 0
        )
        result.append(
            {
                "sessionId": row.id,
                "roleType": row.role_type,
                "status": row.status,
                "currentPhase": row.current_phase,
                "createdAt": row.created_at,
                "updatedAt": row.updated_at,
                "actualDuration": row.actual_duration,
                "messageCount": count,
                "evaluateStatus": row.evaluate_status,
                "evaluateError": row.evaluate_error,
            }
        )
    return ok(result)


@router.get("/voice-interview/sessions/{item_id}")
async def get_voice(item_id: int, db: Db, request: Request):
    return ok(voice_data(await voice_or_error(db, item_id), request))


@router.post("/voice-interview/sessions/{item_id}/end")
async def end_voice(item_id: int, db: Db):
    row = await voice_or_error(db, item_id)
    row.status = "COMPLETED"
    row.current_phase = "COMPLETED"
    row.end_time = utc_now()
    row.actual_duration = max(0, int((row.end_time - row.start_time).total_seconds() / 60))
    row.evaluate_status = "PENDING"
    await db.commit()
    return ok()


@router.put("/voice-interview/sessions/{item_id}/pause")
async def pause_voice(item_id: int, db: Db):
    row = await voice_or_error(db, item_id)
    row.status = "PAUSED"
    row.paused_at = utc_now()
    await db.commit()
    return ok()


@router.put("/voice-interview/sessions/{item_id}/resume")
async def resume_voice(item_id: int, db: Db, request: Request):
    row = await voice_or_error(db, item_id)
    row.status = "IN_PROGRESS"
    row.resumed_at = utc_now()
    await db.commit()
    return ok(voice_data(row, request))


@router.get("/voice-interview/sessions/{item_id}/messages")
async def voice_messages(item_id: int, db: Db):
    await voice_or_error(db, item_id)
    rows = (
        await db.scalars(
            select(VoiceMessage)
            .where(VoiceMessage.session_id == item_id)
            .order_by(VoiceMessage.sequence_num)
        )
    ).all()
    return ok(
        [
            as_dict(
                x,
                "id",
                "session_id",
                "message_type",
                "phase",
                "user_recognized_text",
                "ai_generated_text",
                "timestamp",
                "sequence_num",
            )
            for x in rows
        ]
    )


@router.get("/voice-interview/sessions/{item_id}/evaluation")
async def voice_evaluation(item_id: int, db: Db):
    row = await voice_or_error(db, item_id)
    evaluation = await db.scalar(
        select(VoiceEvaluation).where(VoiceEvaluation.session_id == item_id)
    )
    detail = None
    if evaluation:
        detail = {
            "sessionId": item_id,
            "totalQuestions": len(json.loads(evaluation.question_evaluations_json or "[]")),
            "overallScore": evaluation.overall_score or 0,
            "overallFeedback": evaluation.overall_feedback or "",
            "strengths": json.loads(evaluation.strengths_json or "[]"),
            "improvements": json.loads(evaluation.improvements_json or "[]"),
            "answers": json.loads(evaluation.question_evaluations_json or "[]"),
        }
    return ok(
        {
            "evaluateStatus": row.evaluate_status,
            "evaluateError": row.evaluate_error,
            "evaluation": detail,
        }
    )


@router.post("/voice-interview/sessions/{item_id}/evaluation")
async def generate_voice_evaluation(item_id: int, db: Db):
    await voice_or_error(db, item_id)
    raise BusinessError(10005, "语音评估需要完整ASR会话，当前未接入")


@router.delete("/voice-interview/sessions/{item_id}")
async def delete_voice(item_id: int, db: Db):
    row = await voice_or_error(db, item_id)
    await db.execute(delete(VoiceMessage).where(VoiceMessage.session_id == item_id))
    await db.execute(delete(VoiceEvaluation).where(VoiceEvaluation.session_id == item_id))
    await db.delete(row)
    await db.commit()
    return ok()


@router.post("/career-fair/search")
async def search_fairs(body: dict, db: Db):
    page = max(0, int(body.get("page", 0)))
    size = min(100, max(1, int(body.get("size", 20))))
    query = select(CareerFair).where(CareerFair.is_active.is_(True))
    keyword = body.get("keyword")
    if keyword:
        query = query.where(
            or_(
                CareerFair.title.ilike(f"%{keyword}%"),
                CareerFair.company_name.ilike(f"%{keyword}%"),
            )
        )
    result = await db.execute(
        query.add_columns(func.count().over().label("total_count"))
        .order_by(CareerFair.fair_date)
        .offset(page * size)
        .limit(size)
    )
    page_rows = result.all()
    total = page_rows[0].total_count if page_rows else 0
    return ok(
        {
            "content": [
                as_dict(
                    row.CareerFair,
                    "id",
                    "external_id",
                    "title",
                    "company_name",
                    "university_name",
                    "venue",
                    "address",
                    "fair_date",
                    "start_time",
                    "end_time",
                    "fair_type",
                    "source_url",
                    "view_count",
                )
                for row in page_rows
            ],
            "totalElements": total,
            "totalPages": (total + size - 1) // size,
            "size": size,
            "number": page,
        }
    )


@router.get("/career-fair/upcoming")
async def upcoming_fairs(db: Db, limit: int = 10):
    rows = (
        await db.scalars(
            select(CareerFair)
            .where(CareerFair.is_active.is_(True))
            .order_by(CareerFair.fair_date)
            .limit(min(limit, 100))
        )
    ).all()
    return ok(
        [
            as_dict(
                x,
                "id",
                "external_id",
                "title",
                "company_name",
                "university_name",
                "venue",
                "address",
                "fair_date",
                "start_time",
                "end_time",
                "fair_type",
                "industry",
                "description",
                "requirements",
                "source_url",
                "poster_url",
                "contact_info",
                "view_count",
                "is_active",
                "created_at",
                "updated_at",
            )
            for x in rows
        ]
    )


@router.get("/career-fair/{item_id}")
async def fair_detail(item_id: int, db: Db):
    row = await db.get(CareerFair, item_id)
    if not row:
        raise BusinessError(11001, "招聘会不存在")
    row.view_count += 1
    await db.commit()
    return ok(
        as_dict(
            row,
            "id",
            "external_id",
            "title",
            "company_name",
            "university_name",
            "venue",
            "address",
            "fair_date",
            "start_time",
            "end_time",
            "fair_type",
            "industry",
            "description",
            "requirements",
            "source_url",
            "poster_url",
            "contact_info",
            "view_count",
            "is_active",
            "created_at",
            "updated_at",
        )
    )


async def save_crawled_fairs(db: AsyncSession, records: list[dict]) -> tuple[int, int]:
    new_count = 0
    update_count = 0
    for record in records:
        external_id = record["external_id"]
        row = await db.scalar(select(CareerFair).where(CareerFair.external_id == external_id))
        fields = {
            "title": record.get("title") or record["company_name"],
            "company_name": record.get("company_name"),
            "university_name": record.get("university_name"),
            "venue": record.get("venue"),
            "fair_date": record.get("fair_date"),
            "start_time": record.get("start_time"),
            "end_time": record.get("end_time"),
            "fair_type": "宣讲会",
            "description": record.get("description"),
            "source_url": record["source_url"],
            "is_active": True,
        }
        if fields["fair_date"]:
            fields["fair_date"] = datetime.fromisoformat(fields["fair_date"]).date()
        if fields["start_time"]:
            fields["start_time"] = time.fromisoformat(fields["start_time"])
        if fields["end_time"]:
            fields["end_time"] = time.fromisoformat(fields["end_time"])
        if row:
            for key, value in fields.items():
                setattr(row, key, value)
            update_count += 1
        else:
            db.add(CareerFair(external_id=external_id, **fields))
            new_count += 1
    await db.commit()
    return new_count, update_count


async def run_scrape_task(
    db: AsyncSession, task: ScrapeTask | None, notify: Any = None
) -> dict[str, int]:
    started_at = utc_now()
    record = ScrapeRecord(
        task_id=task.id if task else None,
        source_url=task.source_url if task else None,
    )
    db.add(record)
    if task:
        task.status = "RUNNING"
        task.last_run_time = started_at
    await db.commit()
    total_count = 0
    new_count = 0
    update_count = 0
    try:
        async for event in CqbysCareerFairCrawler().crawl():
            if event["type"] == "data":
                page_records = event["records"]
                page_new, page_updated = await save_crawled_fairs(db, page_records)
                total_count += len(page_records)
                new_count += page_new
                update_count += page_updated
                if notify:
                    message = event.get("message", "正在保存数据")
                    await notify("scraping", message, event["page"], total_count)
            elif event["type"] == "progress" and notify:
                await notify("scraping", event["message"], event["page"], total_count)
            elif event["type"] == "error":
                raise BusinessError(11002, event["message"])
        record.record_count = total_count
        record.new_count = new_count
        record.update_count = update_count
        record.status = "SUCCESS"
        record.completed_at = utc_now()
        record.duration_ms = int((record.completed_at - started_at).total_seconds() * 1000)
        if task:
            task.status = "IDLE"
            task.last_success_time = record.completed_at
            task.last_record_count = total_count
            task.total_run_count += 1
            task.error_message = None
        await db.commit()
        return {"totalCount": total_count, "newCount": new_count, "updateCount": update_count}
    except Exception as exc:
        record.status = "FAILED"
        record.error_message = str(exc)
        record.completed_at = utc_now()
        record.duration_ms = int((record.completed_at - started_at).total_seconds() * 1000)
        if task:
            task.status = "FAILED"
            task.fail_count += 1
            task.total_run_count += 1
            task.error_message = str(exc)
        await db.commit()
        raise


@router.post("/career-fair/scrape")
async def scrape_fair(db: Db):
    result = await run_scrape_task(db, None)
    return ok({**result, "success": True, "message": f"成功同步 {result['totalCount']} 条宣讲会"})


def scrape_task_data(x: ScrapeTask) -> dict:
    return as_dict(
        x,
        "id",
        "task_name",
        "source_url",
        "description",
        "cron_expression",
        "is_enabled",
        "status",
        "last_run_time",
        "last_success_time",
        "last_record_count",
        "total_run_count",
        "fail_count",
        "error_message",
        "created_at",
        "updated_at",
    )


@router.get("/scrape-task")
async def scrape_tasks(db: Db):
    return ok(
        [
            scrape_task_data(x)
            for x in (
                await db.scalars(select(ScrapeTask).order_by(ScrapeTask.created_at.desc()))
            ).all()
        ]
    )


def scrape_record_data(row: ScrapeRecord, task_name: str | None = None) -> dict:
    data = as_dict(
        row,
        "id",
        "task_id",
        "source_url",
        "record_count",
        "new_count",
        "update_count",
        "status",
        "error_message",
        "duration_ms",
        "started_at",
        "completed_at",
    )
    data["taskName"] = task_name
    return data


async def record_page(db: AsyncSession, query, page: int, size: int) -> dict:
    page = max(0, page)
    size = min(100, max(1, size))
    total = await db.scalar(select(func.count()).select_from(query.subquery())) or 0
    rows = (
        await db.execute(
            query.order_by(ScrapeRecord.started_at.desc()).offset(page * size).limit(size)
        )
    ).all()
    return {
        "content": [scrape_record_data(record, task_name) for record, task_name in rows],
        "totalElements": total,
        "totalPages": (total + size - 1) // size,
        "size": size,
        "number": page,
    }


@router.get("/scrape-task/records/recent")
async def recent_records(db: Db, limit: int = 10):
    query = (
        select(ScrapeRecord, ScrapeTask.task_name)
        .outerjoin(ScrapeTask, ScrapeRecord.task_id == ScrapeTask.id)
        .order_by(ScrapeRecord.started_at.desc())
        .limit(min(100, max(1, limit)))
    )
    rows = (await db.execute(query)).all()
    return ok([scrape_record_data(record, task_name) for record, task_name in rows])


@router.get("/scrape-task/records")
async def all_records(db: Db, page: int = 0, size: int = 20):
    query = select(ScrapeRecord, ScrapeTask.task_name).outerjoin(
        ScrapeTask, ScrapeRecord.task_id == ScrapeTask.id
    )
    return ok(await record_page(db, query, page, size))


async def task_or_error(db: AsyncSession, item_id: int) -> ScrapeTask:
    row = await db.get(ScrapeTask, item_id)
    if not row:
        raise BusinessError(11003, "抓取任务不存在")
    return row


@router.get("/scrape-task/{item_id}")
async def task_detail(item_id: int, db: Db):
    return ok(scrape_task_data(await task_or_error(db, item_id)))


@router.post("/scrape-task")
async def create_task(body: ScrapeTaskRequest, db: Db):
    row = ScrapeTask(**body.model_dump(mode="json"))
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return ok(scrape_task_data(row))


@router.put("/scrape-task/{item_id}")
async def update_task(item_id: int, body: ScrapeTaskRequest, db: Db):
    row = await task_or_error(db, item_id)
    for key, value in body.model_dump(mode="json").items():
        setattr(row, key, value)
    await db.commit()
    return ok(scrape_task_data(row))


@router.delete("/scrape-task/{item_id}")
async def remove_task(item_id: int, db: Db):
    await db.delete(await task_or_error(db, item_id))
    await db.commit()
    return ok()


@router.post("/scrape-task/{item_id}/toggle")
async def toggle_task(item_id: int, db: Db):
    row = await task_or_error(db, item_id)
    row.is_enabled = not row.is_enabled
    await db.commit()
    return ok(scrape_task_data(row))


@router.post("/scrape-task/{item_id}/execute")
async def execute_task(item_id: int, db: Db):
    result = await run_scrape_task(db, await task_or_error(db, item_id))
    return ok({**result, "success": True, "message": f"成功同步 {result['totalCount']} 条宣讲会"})


@router.get("/scrape-task/{item_id}/records")
async def task_records(item_id: int, db: Db, page: int = 0, size: int = 20):
    await task_or_error(db, item_id)
    query = (
        select(ScrapeRecord, ScrapeTask.task_name)
        .outerjoin(ScrapeTask, ScrapeRecord.task_id == ScrapeTask.id)
        .where(ScrapeRecord.task_id == item_id)
    )
    return ok(await record_page(db, query, page, size))


@router.get("/scrape-sse/stream/{item_id}")
async def scrape_events(item_id: int, db: Db):
    await task_or_error(db, item_id)

    async def events():
        yield (
            'event: connected\ndata: {"status":"connected","message":"connected",'
            '"progress":0,"page":0,"count":0}\n\n'
        )

    return StreamingResponse(events(), media_type="text/event-stream")


@router.post("/scrape-sse/execute/{item_id}")
async def execute_sse(item_id: int, db: Db):
    task = await task_or_error(db, item_id)

    async def notify(status: str, message: str, page: int, count: int):
        return None

    result = await run_scrape_task(db, task, notify)
    return ok({**result, "success": True, "message": f"成功同步 {result['totalCount']} 条宣讲会"})


async def voice_websocket(websocket: WebSocket, session_id: int):
    await websocket.accept()
    factory = websocket.app.state.session_factory
    async with factory() as db:
        if not await db.get(VoiceSession, session_id):
            await websocket.send_json({"type": "error", "message": "语音面试会话不存在"})
            await websocket.close(code=1008)
            return
    await websocket.send_json(
        {"type": "control", "action": "connected", "message": "session_ready"}
    )
    try:
        while True:
            message = await websocket.receive_json()
            if message.get("type") == "audio":
                await websocket.send_json({"type": "error", "message": "实时DashScope ASR尚未接入"})
            elif message.get("type") == "control":
                await websocket.send_json(
                    {
                        "type": "control",
                        "action": message.get("action", "unknown"),
                        "message": "ack",
                    }
                )
            else:
                await websocket.send_json({"type": "error", "message": "不支持的消息类型"})
    except WebSocketDisconnect:
        pass
