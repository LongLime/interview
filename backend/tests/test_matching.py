import asyncio
import time

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

import app.integrations as integrations
from app.core import Settings
from app.main import create_app
from app.matching import RawDetailedMatch, ScreeningBatch, compute_detailed_match
from app.models import Resume


def annotation(
    requirement_id="python",
    kind="plus",
    weight="must",
    status="hit",
    job_text="熟悉 Python",
    resume_text="Python 项目",
):
    return {
        "requirement_id": requirement_id,
        "kind": kind,
        "weight": weight,
        "status": status,
        "label": "Python 技能",
        "reason": "岗位要求 Python，简历有精确项目证据",
        "color": "green" if kind == "plus" else "red",
        "job_text": job_text,
        "resume_text": resume_text,
    }


def detail_response():
    return {
        "annotations": [
            annotation(),
            annotation(
                "degree",
                kind="minus",
                weight="hard",
                status="missing",
                job_text="硕士学历",
                resume_text=None,
            ),
        ],
        "interview_tips": "准备 Python 项目与学历问题。",
    }


def test_annotation_score_is_normalized_to_a_percentage():
    result = compute_detailed_match(detail_response())
    assert result["score"] == 40
    assert result["grade"] == "B+"
    assert [item["delta"] for item in result["annotations"]] == [12, -25]


def test_annotation_score_is_unbounded():
    raw = {
        "annotations": [annotation(f"requirement-{index}", weight="hard") for index in range(4)],
        "interview_tips": "准备项目细节。",
    }
    result = compute_detailed_match(raw)
    assert result["score"] == 100
    assert result["grade"] == "A"


@pytest.mark.parametrize(
    "change,expected",
    [
        ({"kind": "minus", "job_text": None}, "exact job_text"),
        ({"status": "hit", "resume_text": None}, "resume_text evidence"),
        ({"status": "missing", "resume_text": "不存在的证据"}, "cannot claim"),
        ({"weight": "urgent"}, "Input should be"),
    ],
)
def test_annotation_evidence_and_enums_are_strict(change, expected):
    value = annotation()
    value.update(change)
    with pytest.raises(ValidationError, match=expected):
        RawDetailedMatch.model_validate(
            {"annotations": [value], "interview_tips": "准备项目细节。"}
        )


def test_duplicate_requirement_and_screen_ids_are_rejected():
    value = annotation()
    with pytest.raises(ValidationError, match="duplicate requirement_id"):
        RawDetailedMatch.model_validate(
            {"annotations": [value, value], "interview_tips": "准备项目细节。"}
        )
    batch = ScreeningBatch.model_validate(
        {
            "results": [
                {
                    "job_id": 1,
                    "degree": "ok",
                    "major": "match",
                    "skill": "strong",
                    "reason": "匹配",
                },
                {
                    "job_id": 1,
                    "degree": "ok",
                    "major": "match",
                    "skill": "strong",
                    "reason": "重复",
                },
            ]
        }
    )
    with pytest.raises(ValueError, match="duplicate screening job_id"):
        batch.validate_coverage({1})


def make_app():
    return create_app(
        Settings(
            database_url="sqlite+aiosqlite:///:memory:",
            auto_create_tables=True,
            ai_bailian_api_key="test-key",
            ai_model="test-model",
        )
    )


async def seed_resume(app) -> int:
    async with app.state.session_factory() as db:
        row = Resume(
            file_hash="m" * 64,
            original_filename="candidate.txt",
            resume_text="Python 项目",
            analyze_status="COMPLETED",
        )
        db.add(row)
        await db.commit()
        await db.refresh(row)
        return row.id


def test_single_match_calls_provider_and_persists_job_and_result(monkeypatch):
    calls = 0

    async def fake_complete(self, messages, schema):
        nonlocal calls
        calls += 1
        assert "绝不输出分数" in messages[0]["content"]
        return detail_response(), {
            "prompt_tokens": 10,
            "completion_tokens": 5,
            "total_tokens": 15,
        }

    monkeypatch.setattr(integrations.OpenAIClient, "complete_json_with_usage", fake_complete)
    app = make_app()
    with TestClient(app) as client:
        resume_id = client.portal.call(seed_resume, app)
        job = client.post(
            "/api/jobs",
            json={"company": "Acme", "title": "Python Engineer", "jdText": "熟悉 Python；硕士学历"},
        ).json()["data"]
        response = client.post(
            "/api/match/analyze-single",
            json={
                "resumeId": resume_id,
                "jobTargetId": job["id"],
                "jdText": job["jdText"],
                "company": "Acme",
                "title": "Python Engineer",
            },
        ).json()
        by_resume = client.get(f"/api/match/resume/{resume_id}").json()["data"]
        by_id = client.get(f"/api/match/results/{response['data']['id']}").json()["data"]

    assert calls == 1
    assert response["data"]["score"] == 40
    assert response["data"]["tokenUsage"]["totalTokens"] == 15
    assert by_resume[0]["id"] == by_id["id"]
    assert by_id["status"] == "COMPLETED"


def test_structured_validation_retries_once(monkeypatch):
    calls = 0

    async def fake_complete(self, messages, schema):
        nonlocal calls
        calls += 1
        if calls == 1:
            return {"annotations": [], "unexpected": True}, {}
        return detail_response(), {}

    monkeypatch.setattr(integrations.OpenAIClient, "complete_json_with_usage", fake_complete)
    app = make_app()
    with TestClient(app) as client:
        resume_id = client.portal.call(seed_resume, app)
        response = client.post(
            "/api/match/analyze-single",
            json={"resumeId": resume_id, "jdText": "熟悉 Python；硕士学历"},
        ).json()
    assert response["code"] == 200
    assert calls == 2


def test_smart_task_status_active_and_sse_with_deterministic_provider(monkeypatch):
    async def fake_complete(self, messages, schema):
        if schema.get("title") == "ScreeningBatch":
            return {
                "results": [
                    {
                        "job_id": 1,
                        "degree": "ok",
                        "major": "match",
                        "skill": "strong",
                        "reason": "匹配",
                    },
                    {
                        "job_id": 2,
                        "degree": "below",
                        "major": "match",
                        "skill": "strong",
                        "reason": "学历不符",
                    },
                ]
            }, {"total_tokens": 4}
        return detail_response(), {"total_tokens": 6}

    monkeypatch.setattr(integrations.OpenAIClient, "complete_json_with_usage", fake_complete)
    app = make_app()
    with TestClient(app) as client:
        resume_id = client.portal.call(seed_resume, app)
        for title in ("Python Engineer", "Researcher"):
            client.post("/api/jobs", json={"title": title, "jdText": "熟悉 Python；硕士学历"})
        started = client.post(
            "/api/match/smart",
            json={"resumeId": resume_id, "threshold": 0, "batchSize": 2, "concurrency": 1},
        ).json()["data"]
        task_id = started["taskId"]
        for _ in range(50):
            status = client.get(f"/api/match/smart/{task_id}").json()["data"]
            if status["phase"] in {"done", "error"}:
                break
            time.sleep(0.01)
        active = client.get(f"/api/match/smart/active/{resume_id}").json()["data"]
        stream = client.get(f"/api/match/smart/stream/{task_id}")
        results = client.get(f"/api/match/resume/{resume_id}").json()["data"]

    assert status["phase"] == "done"
    assert status["screenDone"] == 2
    assert status["analyzeDone"] == 1
    assert active == {"active": False}
    assert '"phase": "done"' in stream.text
    assert {row["status"] for row in results} == {"COMPLETED", "SCREENED"}
    assert next(row for row in results if row["hardExcluded"])["screenScore"] == -100000


def test_smart_task_can_be_cancelled(monkeypatch):
    async def slow_complete(self, messages, schema):
        await asyncio.sleep(1)
        return {"results": []}, {}

    monkeypatch.setattr(integrations.OpenAIClient, "complete_json_with_usage", slow_complete)
    app = make_app()
    with TestClient(app) as client:
        resume_id = client.portal.call(seed_resume, app)
        client.post("/api/jobs", json={"title": "Python Engineer", "jdText": "熟悉 Python"})
        task_id = client.post("/api/match/smart", json={"resumeId": resume_id}).json()["data"][
            "taskId"
        ]
        cancelled = client.post(f"/api/match/smart/{task_id}/cancel").json()["data"]
        status = client.get(f"/api/match/smart/{task_id}").json()["data"]
        stream = client.get(f"/api/match/smart/stream/{task_id}")

    assert cancelled["success"] is True
    assert status["phase"] == "cancelled"
    assert "已提交结果保留" in status["message"]
    assert '"phase": "cancelled"' in stream.text
