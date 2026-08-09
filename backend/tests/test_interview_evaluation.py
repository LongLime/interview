from fastapi.testclient import TestClient

import app.api as api_module
from app.core import Settings
from app.main import create_app
from app.models import InterviewAnswer, InterviewSession


class FakeEvaluationClient:
    async def complete_json(self, _messages, _schema):
        return {
            "overall_feedback": "回答基本准确，但覆盖面仍需加强。",
            "strengths": ["能够说明核心概念"],
            "improvements": ["补充底层原理和边界条件"],
            "question_evaluations": [
                {
                    "question_index": 0,
                    "score": 80,
                    "feedback": "核心概念正确，但缺少实现细节。",
                    "reference_answer": "事件循环负责调度就绪任务。",
                    "key_points": ["任务队列", "协作调度"],
                }
            ],
        }


def test_complete_interview_runs_evaluation_and_scores_unanswered_questions_zero(monkeypatch):
    async def fake_evaluation_client(*_args, **_kwargs):
        return FakeEvaluationClient()

    monkeypatch.setattr(api_module, "evaluation_client", fake_evaluation_client)
    app = create_app(Settings(database_url="sqlite+aiosqlite:///:memory:", auto_create_tables=True))
    with TestClient(app) as client:

        async def seed_interview() -> None:
            async with app.state.session_factory() as session:
                interview = InterviewSession(
                    session_id="evaluation-session",
                    total_questions=2,
                    questions_json=(
                        '[{"question":"解释事件循环","category":"Python"},'
                        '{"question":"解释协程","category":"Python"}]'
                    ),
                    status="IN_PROGRESS",
                    llm_provider="dashscope",
                )
                session.add(interview)
                await session.flush()
                session.add(
                    InterviewAnswer(
                        session_id=interview.id,
                        question_index=0,
                        question="解释事件循环",
                        category="Python",
                        user_answer="事件循环负责调度任务",
                    )
                )
                await session.commit()

        client.portal.call(seed_interview)
        completed = client.post("/api/interview/sessions/evaluation-session/complete")
        detail = client.get("/api/interview/sessions/evaluation-session/details").json()["data"]

    assert completed.json()["code"] == 200
    assert detail["status"] == "EVALUATED"
    assert detail["evaluateStatus"] == "COMPLETED"
    assert detail["overallScore"] == 40
    assert [answer["score"] for answer in detail["answers"]] == [80, 0]
    assert detail["strengths"] == ["能够说明核心概念"]
