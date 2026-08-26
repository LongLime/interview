import httpx
import pytest
from fastapi.testclient import TestClient
from pwdlib.hashers.bcrypt import BcryptHasher
from sqlalchemy import select, update

from app.api import evaluate_voice_session_task
from app.core import Settings
from app.integrations import OpenAIClient
from app.main import create_app
from app.models import (
    AppUser,
    InterviewAnswer,
    InterviewSession,
    Resume,
    ResumeAnalysis,
    VoiceEvaluation,
    VoiceMessage,
    VoiceSession,
)


def test_health_result_envelope_and_camel_case():
    app = create_app(Settings(database_url="sqlite+aiosqlite:///:memory:"))
    with TestClient(app) as client:
        response = client.get("/health")
        paths = client.get("/openapi.json").json()["paths"]
    assert response.status_code == 200
    assert response.json() == {"code": 200, "message": "success", "data": {"status": "UP"}}
    assert "/api/resumes/upload" in paths
    assert "/api/interview/sessions/{session_id}/answers" in paths
    assert "/api/knowledgebase/query/stream" in paths


def test_validation_is_http_200_business_error():
    app = create_app(Settings(database_url="sqlite+aiosqlite:///:memory:"))
    with TestClient(app) as client:
        response = client.post("/api/auth/login", json={"username": "", "password": "x"})
    assert response.status_code == 200
    assert response.json()["code"] == 400
    assert response.json()["data"] is None


def test_local_vite_origin_is_allowed_by_cors():
    app = create_app(
        Settings(
            database_url="sqlite+aiosqlite:///:memory:",
            cors_allowed_origins="http://localhost:5173",
        )
    )
    with TestClient(app) as client:
        response = client.options(
            "/api/auth/login",
            headers={
                "Origin": "http://127.0.0.1:5173",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
            },
        )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://127.0.0.1:5173"


def test_register_login_and_me_lifecycle():
    config = Settings(database_url="sqlite+aiosqlite:///:memory:", auto_create_tables=True)
    app = create_app(config)
    with TestClient(app) as client:
        registered = client.post(
            "/api/auth/register",
            json={"username": "tester", "password": "secure-password", "nickname": "Test"},
        ).json()
        assert registered["code"] == 200
        token = registered["data"]["token"]
        me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"}).json()
        login = client.post(
            "/api/auth/login",
            json={"username": "tester", "password": "secure-password"},
        ).json()
    assert me["data"]["username"] == "tester"
    assert login["code"] == 200


def test_login_accepts_legacy_spring_bcrypt_hash():
    config = Settings(database_url="sqlite+aiosqlite:///:memory:", auto_create_tables=True)
    app = create_app(config)
    with TestClient(app) as client:
        client.post(
            "/api/auth/register",
            json={"username": "legacy", "password": "temporary", "nickname": "Legacy"},
        )

        async def replace_hash() -> None:
            async with app.state.session_factory() as session:
                await session.execute(
                    update(AppUser)
                    .where(AppUser.username == "legacy")
                    .values(password_hash=BcryptHasher().hash("spring-password"))
                )
                await session.commit()

        import asyncio

        asyncio.run(replace_hash())
        login = client.post(
            "/api/auth/login",
            json={"username": "legacy", "password": "spring-password"},
        ).json()

    assert login["code"] == 200


def test_resume_list_matches_frontend_contract():
    config = Settings(database_url="sqlite+aiosqlite:///:memory:", auto_create_tables=True)
    app = create_app(config)
    with TestClient(app) as client:

        async def seed_resume() -> None:
            async with app.state.session_factory() as session:
                resume = Resume(
                    file_hash="b" * 64,
                    original_filename="test_resume.txt",
                    file_size=76,
                    resume_text="Python developer",
                    analyze_status="COMPLETED",
                )
                session.add(resume)
                await session.flush()
                session.add(ResumeAnalysis(resume_id=resume.id, overall_score=25))
                await session.commit()

        client.portal.call(seed_resume)
        response = client.get("/api/resumes").json()

    item = response["data"][0]
    assert item["filename"] == "test_resume.txt"
    assert item["latestScore"] == 25
    assert item["interviewCount"] == 0
    assert "originalFilename" not in item


def test_interview_details_matches_frontend_contract():
    config = Settings(database_url="sqlite+aiosqlite:///:memory:", auto_create_tables=True)
    app = create_app(config)
    with TestClient(app) as client:

        async def seed_interview() -> None:
            async with app.state.session_factory() as session:
                interview = InterviewSession(
                    session_id="detail-session",
                    total_questions=1,
                    questions_json='[{"question":"解释事件循环","category":"Python"}]',
                    status="IN_PROGRESS",
                )
                session.add(interview)
                await session.flush()
                session.add(
                    InterviewAnswer(
                        session_id=interview.id,
                        question_index=0,
                        question="解释事件循环",
                        category="Python",
                        user_answer="通过协作调度任务",
                    )
                )
                await session.commit()

        client.portal.call(seed_interview)
        response = client.get("/api/interview/sessions/detail-session/details")

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["sessionId"] == "detail-session"
    assert data["answers"][0]["question"] == "解释事件循环"
    assert data["answers"][0]["userAnswer"] == "通过协作调度任务"


def test_voice_websocket_has_stable_unsupported_asr_shape():
    config = Settings(database_url="sqlite+aiosqlite:///:memory:", auto_create_tables=True)
    app = create_app(config)
    # Lifecycle existence is DB-backed; unknown sessions close with the established error shape.
    with TestClient(app) as client:
        with client.websocket_connect("/ws/voice-interview/999") as socket:
            assert socket.receive_json() == {"type": "error", "message": "语音面试会话不存在"}


def test_voice_evaluation_persists_completed_report(monkeypatch):
    config = Settings(database_url="sqlite+aiosqlite:///:memory:", auto_create_tables=True)
    app = create_app(config)

    class FakeEvaluationClient:
        async def complete_json(self, messages, schema):
            return {
                "overall_feedback": "基础概念掌握较好，建议补充线上故障排查经验。",
                "strengths": ["能够说明数据库索引的作用"],
                "improvements": ["补充索引失效场景"],
                "question_evaluations": [
                    {
                        "question_index": 0,
                        "score": 85,
                        "feedback": "回答覆盖了索引加速查询的核心作用。",
                        "reference_answer": "索引用于减少扫描数据量，并需关注回表和选择性。",
                        "key_points": ["减少扫描", "选择性"],
                    }
                ],
            }

    async def fake_evaluation_client(db, task_config, provider_id):
        return FakeEvaluationClient()

    monkeypatch.setattr("app.api.evaluation_client", fake_evaluation_client)

    with TestClient(app) as client:
        async def seed_and_evaluate() -> tuple[VoiceSession, VoiceEvaluation]:
            async with app.state.session_factory() as session:
                voice_session = VoiceSession(
                    id=1,
                    role_type="Java后端工程师",
                    status="COMPLETED",
                    evaluate_status="PROCESSING",
                )
                session.add(voice_session)
                session.add_all(
                    [
                        VoiceMessage(
                            session_id=1,
                            message_type="AI",
                            ai_generated_text="请说明数据库索引的作用。",
                            sequence_num=1,
                        ),
                        VoiceMessage(
                            session_id=1,
                            message_type="USER",
                            user_recognized_text="索引可以加快查询速度。",
                            sequence_num=2,
                        ),
                    ]
                )
                await session.commit()

            await evaluate_voice_session_task(1, app.state.session_factory, config)

            async with app.state.session_factory() as session:
                completed_session = await session.get(VoiceSession, 1)
                evaluation = await session.scalar(
                    select(VoiceEvaluation).where(VoiceEvaluation.session_id == 1)
                )
                assert completed_session is not None
                assert evaluation is not None
                return completed_session, evaluation

        voice_session, evaluation = client.portal.call(seed_and_evaluate)

    assert voice_session.status == "COMPLETED"
    assert voice_session.evaluate_status == "COMPLETED"
    assert evaluation.overall_score == 85
    assert "索引" in evaluation.question_evaluations_json


@pytest.mark.asyncio
async def test_stream_text_skips_empty_choices_events(monkeypatch):
    async def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/v1/chat/completions"
        return httpx.Response(
            200,
            headers={"content-type": "text/event-stream"},
            content=(
                b'data: {"id":"chatcmpl-1","choices":[]}\n\n'
                b'data: {"choices":[{"delta":{"content":"\\u8bf7\\u8bf4\\u660e\\u6838\\u5fc3'
                b'\\u94fe\\u8def"}}]}\n\n'
                b"data: [DONE]\n\n"
            ),
        )

    transport = httpx.MockTransport(handler)
    original_async_client = httpx.AsyncClient

    def mock_async_client(*args, **kwargs):
        kwargs["transport"] = transport
        return original_async_client(*args, **kwargs)

    monkeypatch.setattr(httpx, "AsyncClient", mock_async_client)
    client = OpenAIClient("https://example.test/v1", "test-key", "test-model")
    chunks = [chunk async for chunk in client.stream_text([{"role": "user", "content": "测试"}])]

    assert chunks == ["请说明核心链路"]
