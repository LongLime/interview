import itertools

import pytest

from app.scoring import (
    DIMENSION_MAX,
    RUBRIC,
    SCORE_TABLE,
    SCREEN_DEGREE_SCORE,
    SCREEN_HARD_EXCLUDE,
    SCREEN_MAJOR_SCORE,
    SCREEN_SKILL_SCORE,
    build_resume_analysis_prompt,
    compute_analysis,
    compute_screen_score,
    grade_from_match_score,
    grade_from_score,
    lookup_delta,
    render_rubric_for_prompt,
)


def raw_with_bands(highest: bool = True, parse_success: bool = True) -> dict:
    return {
        "parse_success": parse_success,
        "candidate_profile": {
            "name": None,
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
            "skill_tags": [],
            "skill_categories": {
                "programming_languages": [],
                "frameworks": [],
                "tools": [],
                "databases": [],
                "certificates": [],
                "languages": [],
                "other": [],
            },
            "experience_summary": {
                "internship_count": 0,
                "project_count": 0,
                "competition_count": 0,
                "paper_count": 0,
            },
            "experience_tags": [],
            "experience_industries": [],
            "inferred_target_roles": [],
            "highlights": [],
        },
        "style_detection": {"style": "standard", "risk_flags": []},
        "one_line_summary": "简历基础结构完整，但仍需补充可验证的能力证据。",
        "suggestions": [
            {
                "priority": 1,
                "severity": "critical",
                "color": "green",
                "dimension": "completeness",
                "item": "实习经历",
                "problem": "简历未体现与目标岗位相关的实习经历",
                "recommendation": "中长期寻找相关实习或真实项目，并记录职责与成果，禁止虚构经历。",
                "time_horizon": "medium_term",
                "gap_type": "internship",
                "related_item_id": "has_experience",
                "effort": "hard",
            },
            {
                "priority": 2,
                "severity": "important",
                "color": "blue",
                "dimension": "persuasiveness",
                "item": "量化成果",
                "problem": "已有经历缺少可以验证的量化结果",
                "recommendation": "投递前补充真实的规模、效率或质量指标，并保留计算依据。",
                "time_horizon": "immediate",
                "gap_type": "resume_evidence",
                "related_item_id": "quantification",
                "resume_text": "负责项目开发",
                "suggested_text": "负责项目开发，支持真实用户规模并提升处理效率",
                "effort": "easy",
            },
            {
                "priority": 3,
                "severity": "minor",
                "color": "green",
                "dimension": "completeness",
                "item": "竞赛奖项",
                "problem": "简历未体现竞赛或奖项等外部能力证明",
                "recommendation": "后续选择与目标岗位相关的竞赛参与，取得真实结果后再写入简历。",
                "time_horizon": "medium_term",
                "gap_type": "award",
                "related_item_id": None,
                "effort": "hard",
            },
        ],
        "item_assessments": [
            {
                "item_id": item.id,
                "band_id": max(item.bands, key=lambda band: band.score).id
                if highest
                else min(item.bands, key=lambda band: band.score).id,
                "status": "pass",
            }
            for item in RUBRIC
        ],
    }


def test_rubric_and_dimension_maxima_are_exact():
    result = compute_analysis(raw_with_bands())
    assert result["scoring"]["total_score"] == 100
    assert {
        key: value["score"] for key, value in result["scoring"]["dimensions"].items()
    } == DIMENSION_MAX
    for dimension, maximum in DIMENSION_MAX.items():
        assert sum(item.max for item in RUBRIC if item.dimension == dimension) == maximum
    contact = RUBRIC[0]
    assert contact.rule == "三项齐全=5；缺一项扣2分（按实际缺失项数选档）"
    assert contact.bands[-1].desc == "三项均缺"
    assert f"判定: {contact.rule}" in render_rubric_for_prompt()


def test_parse_failure_forces_every_item_and_total_to_zero():
    result = compute_analysis(raw_with_bands(parse_success=False))
    assert result["scoring"]["total_score"] == 0
    assert all(
        detail["score"] == 0
        for dimension in result["scoring"]["dimensions"].values()
        for detail in dimension["details"]
    )


def test_suggestions_are_normalized_for_frontend():
    result = compute_analysis(raw_with_bands())
    suggestions = result["suggestions"]
    assert [item["priority"] for item in suggestions] == ["高", "中", "低"]
    assert suggestions[0]["gapType"] == "internship"
    assert suggestions[0]["timeHorizon"] == "medium_term"
    assert suggestions[1]["recommendation"]


def test_prompt_requires_immediate_and_long_term_gap_advice():
    prompt = build_resume_analysis_prompt("测试简历")
    expected_terms = (
        "实习",
        "项目",
        "竞赛",
        "奖项",
        "immediate",
        "medium_term",
        "不能建议用户编造",
    )
    for expected in expected_terms:
        assert expected in prompt


def test_missing_and_invalid_bands_are_rejected():
    raw = raw_with_bands(highest=False)
    raw["item_assessments"] = [{"item_id": "contact", "band_id": "invalid"}]
    with pytest.raises(ValueError, match="coverage mismatch"):
        compute_analysis(raw)


def test_duplicate_item_ids_are_rejected():
    raw = raw_with_bands()
    raw["item_assessments"][-1] = raw["item_assessments"][0]
    with pytest.raises(ValueError, match="duplicate rubric item_id"):
        compute_analysis(raw)


@pytest.mark.parametrize(
    ("score", "grade"),
    [
        (-1, "D"),
        (59.999, "D"),
        (60, "C"),
        (69.999, "C"),
        (70, "B"),
        (79.999, "B"),
        (80, "B+"),
        (89.999, "B+"),
        (90, "A"),
        (100, "A"),
    ],
)
def test_resume_grade_boundaries(score, grade):
    assert grade_from_score(score) == grade


def test_every_match_tuple_matches_authoritative_table():
    for kind, weights in SCORE_TABLE.items():
        for weight, statuses in weights.items():
            for status, expected in statuses.items():
                assert lookup_delta(kind, weight, status) == expected
    assert (
        sum(len(statuses) for weights in SCORE_TABLE.values() for statuses in weights.values())
        == 18
    )
    assert lookup_delta("invalid", "must", "hit") == 0


@pytest.mark.parametrize(
    ("score", "grade"),
    [
        (-1, "D"),
        (0, "C"),
        (14.999, "C"),
        (15, "B"),
        (34.999, "B"),
        (35, "B+"),
        (59.999, "B+"),
        (60, "A"),
    ],
)
def test_match_grade_boundaries(score, grade):
    assert grade_from_match_score(score) == grade


def test_all_64_screen_combinations():
    combinations = itertools.product(SCREEN_DEGREE_SCORE, SCREEN_MAJOR_SCORE, SCREEN_SKILL_SCORE)
    checked = 0
    for degree, major, skill in combinations:
        expected = (
            SCREEN_HARD_EXCLUDE
            if degree == "below"
            else SCREEN_DEGREE_SCORE[degree] + SCREEN_MAJOR_SCORE[major] + SCREEN_SKILL_SCORE[skill]
        )
        assert compute_screen_score(degree, major, skill) == expected
        checked += 1
    assert checked == 64
