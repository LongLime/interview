import io
from datetime import datetime

from fastapi.testclient import TestClient
from pypdf import PdfReader

from app.core import Settings
from app.main import create_app
from app.models import (
    Contribution,
    ContributionCompany,
    ContributionQuestion,
    ContributionTopic,
    InterviewAnswer,
    InterviewSession,
    Resume,
    ResumeAnalysis,
)


def test_contribution_contract_and_lifecycle():
    app = create_app(Settings(database_url="sqlite+aiosqlite:///:memory:", auto_create_tables=True))
    with TestClient(app) as client:

        async def seed():
            async with app.state.session_factory() as db:
                company = ContributionCompany(name="示例科技", short_name="示例", tier="T1")
                topic = ContributionTopic(topic_key="Python", topic_label="Python基础")
                verified = Contribution(
                    company=company,
                    position="后端工程师",
                    interview_year=2026,
                    interview_month=8,
                    interview_type="SOCIAL",
                    interview_round=2,
                    contributor_nickname="贡献者",
                    is_anonymous=False,
                    verified=True,
                )
                verified.questions = [
                    ContributionQuestion(
                        question_text="解释异步 IO",
                        category_key="PYTHON",
                        category_label="Python",
                        difficulty="MEDIUM",
                        question_type="DISCUSSION",
                        key_points=["事件循环"],
                        topics=[topic],
                    )
                ]
                db.add(verified)
                await db.commit()
                return company.id, verified.id

        company_id, contribution_id = client.portal.call(seed)
        companies = client.get("/api/contributions/companies")
        topics = client.get("/api/contributions/topics")
        listing = client.get(
            "/api/contributions",
            params={"companyId": company_id, "position": "后端", "year": 2026},
        )
        detail = client.get(f"/api/contributions/{contribution_id}")
        helpful = client.post(f"/api/contributions/{contribution_id}/helpful")
        submitted = client.post(
            "/api/contributions",
            json={
                "companyId": company_id,
                "position": "Python工程师",
                "interviewYear": 2026,
                "interviewMonth": 8,
                "questions": [{"questionText": "什么是协程？", "keyPoints": ["调度"]}],
                "anonymous": True,
            },
        )
        stats = client.get("/api/contributions/stats")

        assert companies.json() == [
            {"id": company_id, "name": "示例科技", "shortName": "示例", "tier": "T1"}
        ]
        assert topics.json() == ["Python基础"]
        assert "code" not in listing.json()
        assert listing.json()["totalElements"] == 1
        assert listing.json()["content"][0]["questionCount"] == 1
        assert listing.json()["content"][0]["categoryLabels"] == ["Python"]
        assert detail.json()["viewCount"] == 1
        assert detail.json()["questions"][0]["topics"] == ["Python基础"]
        assert detail.json()["questions"][0]["keyPoints"] == ["事件循环"]
        assert helpful.json()["success"] is True
        assert submitted.json()["message"] == "面经提交成功，等待审核"
        assert stats.json() == {
            "totalContributions": 1,
            "totalQuestions": 2,
            "totalCompanies": 1,
            "totalTopics": 1,
            "pendingReview": 1,
            "thisMonthContributions": 2,
        }


def test_pdf_exports_are_raw_pdf_with_utf8_filename():
    app = create_app(Settings(database_url="sqlite+aiosqlite:///:memory:", auto_create_tables=True))
    with TestClient(app) as client:

        async def seed():
            async with app.state.session_factory() as db:
                resume = Resume(
                    file_hash="a" * 64,
                    original_filename="中文简历.txt",
                    resume_text="候选人具有 Python 开发经验。",
                    analyze_status="COMPLETED",
                )
                db.add(resume)
                await db.flush()
                db.add(
                    ResumeAnalysis(
                        resume_id=resume.id,
                        overall_score=88,
                        summary="技术基础扎实",
                        strengths_json='["表达清晰"]',
                        suggestions_json='["补充量化结果"]',
                    )
                )
                session = InterviewSession(
                    session_id="pdf-session",
                    total_questions=1,
                    questions_json='[{"question":"解释事件循环"}]',
                    status="COMPLETED",
                    overall_score=90,
                    overall_feedback="回答准确",
                    created_at=datetime(2026, 8, 1, 10, 0),
                )
                db.add(session)
                await db.flush()
                db.add(
                    InterviewAnswer(
                        session_id=session.id,
                        question_index=0,
                        question="解释事件循环",
                        user_answer="通过协作调度处理任务",
                        score=90,
                    )
                )
                await db.commit()
                return resume.id

        resume_id = client.portal.call(seed)
        resume_response = client.get(f"/api/resumes/{resume_id}/export")
        interview_response = client.get("/api/interview/sessions/pdf-session/export")

    for response in (resume_response, interview_response):
        assert response.status_code == 200
        assert response.headers["content-type"] == "application/pdf"
        assert "filename*=UTF-8''" in response.headers["content-disposition"]
        assert response.content.startswith(b"%PDF-")
        assert len(PdfReader(io.BytesIO(response.content)).pages) >= 1


def test_export_missing_resource_keeps_business_error_contract():
    app = create_app(Settings(database_url="sqlite+aiosqlite:///:memory:", auto_create_tables=True))
    with TestClient(app) as client:
        response = client.get("/api/interview/sessions/missing/export")
    assert response.status_code == 200
    assert response.json()["code"] == 3001
