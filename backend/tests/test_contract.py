from fastapi.testclient import TestClient
from pwdlib.hashers.bcrypt import BcryptHasher
from sqlalchemy import update

from app.core import Settings
from app.main import create_app
from app.models import AppUser, InterviewAnswer, InterviewSession, Resume, ResumeAnalysis


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
