import asyncio
from types import SimpleNamespace

from fastapi.testclient import TestClient

import app.api as api_module
import app.integrations as integrations
from app.core import BusinessError, Settings
from app.main import create_app
from app.scoring import RUBRIC


def analysis_result(score: int = 70) -> dict:
    return {
        "parse_success": True,
        "parse_error": None,
        "scoring": {
            "total_score": score,
            "one_line_summary": "简历具备基础信息，建议继续补充能力证据。",
            "dimensions": {
                "completeness": {"score": 20},
                "clarity": {"score": 15},
                "persuasiveness": {"score": 25},
                "professionalism": {"score": 10},
            },
        },
        "suggestions": [
            {
                "category": "内容",
                "priority": "高",
                "issue": "缺少相关实习证据",
                "recommendation": "寻找真实实习或项目，积累后再写入简历。",
            }
        ],
        "candidate_profile": {
            "name": "测试候选人",
            "skill_tags": ["Python"],
            "highlights": ["项目经历"],
        },
        "style_detection": {
            "style": "creative",
            "risk_flags": [
                {"type": "multi_column", "detail": "双栏排版", "suggestion": "准备单栏版本"}
            ],
        },
        "metadata": {
            "provider": "test-provider",
            "model": "test-model",
            "version": "job-agent-v1",
            "tokenUsage": {"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15},
        },
    }


def strict_model_result() -> dict:
    return {
        "parse_success": True,
        "parse_error": None,
        "one_line_summary": "简历结构完整，仍可加强量化证据。",
        "candidate_profile": {
            "name": "测试候选人",
            "phone": None,
            "email": None,
            "target_city": None,
            "education": {
                "university": None,
                "degree": None,
                "major": None,
                "graduation_date": None,
                "gpa": None,
                "gpa_rank": None,
                "relevant_courses": [],
            },
            "skill_tags": ["Python"],
            "skill_categories": {
                "programming_languages": ["Python"],
                "frameworks": [],
                "tools": [],
                "databases": [],
                "certificates": [],
                "languages": [],
                "other": [],
            },
            "experience_summary": {
                "internship_count": 0,
                "project_count": 1,
                "competition_count": 0,
                "paper_count": 0,
            },
            "experience_tags": ["后端开发"],
            "experience_industries": [],
            "inferred_target_roles": ["Python 开发"],
            "highlights": ["项目经历"],
        },
        "item_assessments": [
            {
                "item_id": item.id,
                "band_id": max(item.bands, key=lambda band: band.score).id,
                "status": "pass",
                "note": "客观依据",
            }
            for item in RUBRIC
        ],
        "suggestions": [],
        "style_detection": {"style": "standard", "risk_flags": []},
    }


def test_resume_analysis_retries_after_invalid_coverage(monkeypatch):
    calls = 0

    async def fake_complete(self, messages, schema):
        nonlocal calls
        calls += 1
        result = strict_model_result()
        if calls == 1:
            result["item_assessments"] = result["item_assessments"][:-1]
        return result, {"prompt_tokens": 2, "completion_tokens": 3, "total_tokens": 5}

    monkeypatch.setattr(integrations.OpenAIClient, "complete_json_with_usage", fake_complete)
    config = Settings(ai_bailian_api_key="test", ai_model="test-model")
    request = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(settings=config)))
    result = asyncio.run(api_module.grade_resume("Python 项目", request))

    assert calls == 2
    assert result["scoring"]["total_score"] == 100
    assert result["candidate_profile"]["experience_tags"] == ["后端开发"]
    assert result["metadata"]["tokenUsage"]["total_tokens"] == 5


def test_same_name_and_same_content_create_numbered_independent_resumes(monkeypatch):
    async def fake_store(*_args, **_kwargs):
        return "http://storage.test/resume.txt"

    async def fake_grade(*_args, **_kwargs):
        return analysis_result()

    monkeypatch.setattr(api_module, "store_file", fake_store)
    monkeypatch.setattr(api_module, "grade_resume", fake_grade)
    app = create_app(Settings(database_url="sqlite+aiosqlite:///:memory:", auto_create_tables=True))

    with TestClient(app) as client:
        first = client.post(
            "/api/resumes/upload",
            files={"file": ("test_resume.txt", b"same resume", "text/plain")},
        ).json()
        second = client.post(
            "/api/resumes/upload",
            files={"file": ("test_resume.txt", b"same resume", "text/plain")},
        ).json()
        third = client.post(
            "/api/resumes/upload",
            files={"file": ("test_resume.txt", b"different resume", "text/plain")},
        ).json()
        rows = client.get("/api/resumes").json()["data"]
        detail = client.get(
            f"/api/resumes/{first['data']['storage']['resumeId']}/detail"
        ).json()["data"]
        analysis_id = detail["analyses"][0]["id"]
        history = client.get(
            f"/api/resumes/{first['data']['storage']['resumeId']}/analyses"
        ).json()["data"]
        rich = client.get(
            f"/api/resumes/{first['data']['storage']['resumeId']}/analyses/{analysis_id}"
        ).json()["data"]

    assert first["data"]["storage"]["resumeId"] != second["data"]["storage"]["resumeId"]
    assert first["data"]["duplicate"] is False
    assert second["data"]["duplicate"] is True
    assert {row["filename"] for row in rows} == {
        "test_resume.txt",
        "test_resume（1）.txt",
        "test_resume（2）.txt",
    }
    assert third["data"]["filename"] == "test_resume（2）.txt"
    assert history[0]["candidateProfile"]["skill_tags"] == ["Python"]
    assert rich["styleDetection"]["risk_flags"][0]["type"] == "multi_column"
    assert rich["grade"] is None
    assert rich["provider"] == "test-provider"
    assert rich["tokenUsage"]["totalTokens"] == 15


def test_reanalysis_can_recover_after_failure(monkeypatch):
    async def fake_store(*_args, **_kwargs):
        return "http://storage.test/resume.txt"

    async def successful_grade(*_args, **_kwargs):
        return analysis_result()

    monkeypatch.setattr(api_module, "store_file", fake_store)
    monkeypatch.setattr(api_module, "grade_resume", successful_grade)
    app = create_app(Settings(database_url="sqlite+aiosqlite:///:memory:", auto_create_tables=True))

    with TestClient(app) as client:
        uploaded = client.post(
            "/api/resumes/upload",
            files={"file": ("resume.txt", b"resume content", "text/plain")},
        ).json()
        resume_id = uploaded["data"]["storage"]["resumeId"]

        async def failed_grade(*_args, **_kwargs):
            raise BusinessError(7003, "temporary provider failure")

        monkeypatch.setattr(api_module, "grade_resume", failed_grade)
        failed = client.post(f"/api/resumes/{resume_id}/reanalyze").json()
        failed_detail = client.get(f"/api/resumes/{resume_id}/detail").json()["data"]

        monkeypatch.setattr(api_module, "grade_resume", successful_grade)
        recovered = client.post(f"/api/resumes/{resume_id}/reanalyze").json()
        recovered_detail = client.get(f"/api/resumes/{resume_id}/detail").json()["data"]

    assert failed["code"] == 7003
    assert failed_detail["analyzeStatus"] == "FAILED"
    assert failed_detail["analyzeError"] == "temporary provider failure"
    assert recovered["code"] == 200
    assert recovered_detail["analyzeStatus"] == "COMPLETED"
    assert recovered_detail["analyzeError"] is None
    assert len(recovered_detail["analyses"]) == 2
