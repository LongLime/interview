from datetime import date, datetime, timedelta

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
    CareerFair,
    InterviewAnswer,
    InterviewSession,
    Resume,
    ResumeAnalysis,
    VoiceEvaluation,
    VoiceMessage,
    VoiceSession,
)
from app.voice_pipeline import exchange_webrtc_sdp


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


def test_career_fair_user_state_is_private_and_persistent():
    config = Settings(database_url="sqlite+aiosqlite:///:memory:", auto_create_tables=True)
    app = create_app(config)
    with TestClient(app) as client:
        first_user = client.post(
            "/api/auth/register",
            json={"username": "fair-user-a", "password": "secure-password", "nickname": "A"},
        ).json()["data"]
        second_user = client.post(
            "/api/auth/register",
            json={"username": "fair-user-b", "password": "secure-password", "nickname": "B"},
        ).json()["data"]

        async def seed_career_fair() -> None:
            async with app.state.session_factory() as session:
                session.add(
                    CareerFair(
                        external_id="test-fair",
                        title="测试招聘会",
                        company_name="测试公司",
                        fair_date=datetime(2026, 9, 1).date(),
                    )
                )
                await session.commit()

        client.portal.call(seed_career_fair)
        first_headers = {"Authorization": f"Bearer {first_user['token']}"}
        second_headers = {"Authorization": f"Bearer {second_user['token']}"}
        updated = client.put(
            "/api/career-fair/1/state",
            headers=first_headers,
            json={"isFavorited": True, "isScheduled": True},
        ).json()
        first_state = client.get("/api/career-fair/1/state", headers=first_headers).json()
        second_state = client.get("/api/career-fair/1/state", headers=second_headers).json()

    assert updated["data"] == {"isFavorited": True, "isScheduled": True}
    assert first_state["data"] == {"isFavorited": True, "isScheduled": True}
    assert second_state["data"] == {"isFavorited": False, "isScheduled": False}


def test_career_fair_favorites_and_recommendations_follow_user_preferences():
    config = Settings(database_url="sqlite+aiosqlite:///:memory:", auto_create_tables=True)
    app = create_app(config)
    with TestClient(app) as client:
        first_user = client.post(
            "/api/auth/register",
            json={"username": "recommend-a", "password": "secure-password", "nickname": "A"},
        ).json()["data"]
        second_user = client.post(
            "/api/auth/register",
            json={"username": "recommend-b", "password": "secure-password", "nickname": "B"},
        ).json()["data"]

        async def seed_career_fairs() -> None:
            async with app.state.session_factory() as session:
                session.add_all(
                    [
                        CareerFair(
                            external_id="favorite-tech",
                            title="科技行业双选会",
                            company_name="未来科技",
                            fair_date=date.today() + timedelta(days=2),
                            fair_type="dual",
                            industry="信息技术",
                        ),
                        CareerFair(
                            external_id="recommended-tech",
                            title="软件人才招聘会",
                            company_name="另一家公司",
                            fair_date=date.today() + timedelta(days=3),
                            fair_type="dual",
                            industry="信息技术",
                        ),
                        CareerFair(
                            external_id="ended-tech",
                            title="已结束技术招聘会",
                            fair_date=date.today() - timedelta(days=1),
                            industry="信息技术",
                        ),
                    ]
                )
                await session.commit()

        client.portal.call(seed_career_fairs)
        first_headers = {"Authorization": f"Bearer {first_user['token']}"}
        second_headers = {"Authorization": f"Bearer {second_user['token']}"}
        client.put(
            "/api/career-fair/1/state",
            headers=first_headers,
            json={"isFavorited": True, "isScheduled": False},
        )
        first_favorites = client.get(
            "/api/career-fair/favorites", headers=first_headers
        ).json()["data"]
        second_favorites = client.get(
            "/api/career-fair/favorites", headers=second_headers
        ).json()["data"]
        recommendations = client.post(
            "/api/career-fair/recommendations",
            headers=first_headers,
            json={"limit": 10},
        ).json()["data"]

    assert [item["title"] for item in first_favorites["content"]] == ["科技行业双选会"]
    assert second_favorites["content"] == []
    assert recommendations[0]["title"] == "科技行业双选会"
    assert recommendations[0]["recommendScore"] > 0
    assert "行业相似" in recommendations[0]["recommendReason"]
    assert all(item["title"] != "已结束技术招聘会" for item in recommendations)


def test_career_fair_schedule_crud_is_private():
    config = Settings(database_url="sqlite+aiosqlite:///:memory:", auto_create_tables=True)
    app = create_app(config)
    with TestClient(app) as client:
        first_user = client.post(
            "/api/auth/register",
            json={"username": "schedule-a", "password": "secure-password", "nickname": "A"},
        ).json()["data"]
        second_user = client.post(
            "/api/auth/register",
            json={"username": "schedule-b", "password": "secure-password", "nickname": "B"},
        ).json()["data"]

        async def seed_career_fair() -> None:
            async with app.state.session_factory() as session:
                session.add(
                    CareerFair(
                        external_id="schedule-fair",
                        title="日程测试招聘会",
                        company_name="测试公司",
                        fair_date=date(2026, 9, 1),
                    )
                )
                await session.commit()

        client.portal.call(seed_career_fair)
        first_headers = {"Authorization": f"Bearer {first_user['token']}"}
        second_headers = {"Authorization": f"Bearer {second_user['token']}"}
        created = client.post(
            "/api/career-fair/schedules",
            headers=first_headers,
            json={
                "careerFairId": 1,
                "title": "参加招聘会",
                "startTime": "2026-09-01T09:00:00",
                "endTime": "2026-09-01T12:00:00",
                "location": "主校区",
                "notes": "准备简历",
                "remindMinutes": 30,
            },
        ).json()
        schedule_id = created["data"]["id"]
        first_list = client.get("/api/career-fair/schedules", headers=first_headers).json()
        second_list = client.get("/api/career-fair/schedules", headers=second_headers).json()
        updated = client.put(
            f"/api/career-fair/schedules/{schedule_id}",
            headers=first_headers,
            json={
                "careerFairId": 1,
                "title": "参加招聘会（已更新）",
                "startTime": "2026-09-01T10:00:00",
                "endTime": None,
                "location": "线上",
                "notes": None,
                "remindMinutes": 15,
            },
        ).json()
        forbidden_update = client.put(
            f"/api/career-fair/schedules/{schedule_id}",
            headers=second_headers,
            json={"title": "越权", "startTime": "2026-09-01T09:00:00"},
        ).json()
        deleted = client.delete(
            f"/api/career-fair/schedules/{schedule_id}", headers=first_headers
        ).json()

    assert created["data"]["careerFairId"] == 1
    assert first_list["data"][0]["title"] == "参加招聘会"
    assert second_list["data"] == []
    assert updated["data"]["title"] == "参加招聘会（已更新）"
    assert forbidden_update["code"] != 200
    assert deleted["code"] == 200


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


@pytest.mark.anyio
async def test_webrtc_sdp_exchange_uses_workspace_region_endpoint(monkeypatch):
    async def handler(request: httpx.Request) -> httpx.Response:
        assert request.url == (
            "https://workspace-123.cn-beijing.maas.aliyuncs.com/api/v1/webrtc/realtime"
            "?model=qwen3.5-omni-flash-realtime"
        )
        assert request.headers["Authorization"] == "Bearer test-key"
        assert request.headers["Content-Type"] == "application/sdp"
        assert await request.aread() == b"v=0\r\n"
        return httpx.Response(200, text="v=0\r\na=setup:active\r\n")

    original_client = httpx.AsyncClient
    transport = httpx.MockTransport(handler)
    monkeypatch.setattr(
        "app.voice_pipeline.httpx.AsyncClient",
        lambda **kwargs: original_client(transport=transport, **kwargs),
    )
    config = Settings(
        ai_bailian_api_key="test-key",
        ai_bailian_workspace_id="workspace-123",
        ai_bailian_realtime_region="cn-beijing",
    )

    answer = await exchange_webrtc_sdp(config, "v=0\r\n")

    assert answer == "v=0\r\na=setup:active\r\n"


@pytest.mark.anyio
async def test_webrtc_sdp_exchange_requires_workspace_id():
    config = Settings(ai_bailian_api_key="test-key", ai_bailian_workspace_id=None)

    with pytest.raises(RuntimeError, match="AI_BAILIAN_WORKSPACE_ID"):
        await exchange_webrtc_sdp(config, "v=0\r\n")


def test_voice_webrtc_exchange_and_transcript_persistence(monkeypatch):
    config = Settings(database_url="sqlite+aiosqlite:///:memory:", auto_create_tables=True)
    app = create_app(config)

    async def fake_exchange(settings, offer_sdp):
        assert offer_sdp == "v=0\r\n"
        return "v=0\r\na=setup:active\r\n"

    monkeypatch.setattr("app.api.exchange_webrtc_sdp", fake_exchange)

    with TestClient(app) as client:
        registered = client.post(
            "/api/auth/register",
            json={
                "username": "voiceuser",
                "password": "secure-password",
                "nickname": "Voice User",
            },
        ).json()
        token = registered["data"]["token"]

        async def seed_voice_session() -> None:
            async with app.state.session_factory() as session:
                session.add(
                    VoiceSession(
                        id=1,
                        role_type="TECHNICAL_INTERVIEWER",
                        skill_id="java-backend",
                        difficulty="mid",
                        status="IN_PROGRESS",
                        current_phase="INTRO",
                    )
                )
                await session.commit()

        client.portal.call(seed_voice_session)
        exchange = client.post(
            "/api/voice-interview/sessions/1/webrtc/sdp",
            json={"offerSdp": "v=0\r\n"},
        ).json()
        appended = client.post(
            "/api/voice-interview/sessions/1/messages",
            headers={"Authorization": f"Bearer {token}"},
            json={"messageType": "USER", "userText": "我负责过支付链路重构。"},
        ).json()

        async def load_message() -> VoiceMessage | None:
            async with app.state.session_factory() as session:
                return await session.scalar(
                    select(VoiceMessage).where(VoiceMessage.session_id == 1)
                )

        message = client.portal.call(load_message)

    assert exchange["code"] == 200
    assert exchange["data"]["answerSdp"] == "v=0\r\na=setup:active\r\n"
    assert exchange["data"]["model"] == "qwen3.5-omni-flash-realtime"
    assert "java-backend" in exchange["data"]["instructions"]
    assert appended["code"] == 200
    assert message is not None
    assert message.user_recognized_text == "我负责过支付链路重构。"
    assert message.sequence_num == 1


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
