from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

Dimension = Literal["completeness", "clarity", "persuasiveness", "professionalism"]
DIMENSION_MAX: dict[Dimension, int] = {
    "completeness": 25,
    "clarity": 20,
    "persuasiveness": 40,
    "professionalism": 15,
}
DIMENSION_LABEL = {
    "completeness": "完整性",
    "clarity": "清晰度",
    "persuasiveness": "说服力",
    "professionalism": "专业性",
}


class Band(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")
    id: str
    score: int
    desc: str


class RubricItem(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")
    id: str
    item: str
    max: int
    dimension: Dimension
    rule: str
    bands: tuple[Band, ...]


def _item(
    item_id: str,
    label: str,
    maximum: int,
    dimension: Dimension,
    rule: str,
    bands: list[tuple[str, int, str]],
) -> RubricItem:
    return RubricItem(
        id=item_id,
        item=label,
        max=maximum,
        dimension=dimension,
        rule=rule,
        bands=tuple(Band(id=band_id, score=score, desc=desc) for band_id, score, desc in bands),
    )


# Authoritative transcription of job-agent/server/src/ai/scoring-rubric.ts.
RUBRIC = (
    _item(
        "contact",
        "联系方式（姓名+电话+邮箱）",
        5,
        "completeness",
        "三项齐全=5；缺一项扣2分（按实际缺失项数选档）",
        [
            ("contact_full", 5, "姓名+电话+邮箱齐全"),
            ("contact_miss1", 3, "缺其中一项"),
            ("contact_miss2", 1, "缺其中两项"),
            ("contact_miss3", 0, "三项均缺"),
        ],
    ),
    _item(
        "education_info",
        "教育信息（学校+专业+学历+毕业时间）",
        5,
        "completeness",
        "四项齐全=5；缺一项=4；缺两项=2；缺三项及以上=1（按实际缺失项数选档）",
        [
            ("edu_full", 5, "学校+专业+学历+毕业时间齐全"),
            ("edu_miss1", 4, "缺一项"),
            ("edu_miss2", 2, "缺两项"),
            ("edu_miss3plus", 1, "缺三项及以上"),
        ],
    ),
    _item(
        "gpa",
        "GPA或成绩排名",
        3,
        "completeness",
        "有标注=满分，未标注=0。不因GPA数值低扣分",
        [("gpa_present", 3, "标注了 GPA 或成绩排名"), ("gpa_absent", 0, "未标注")],
    ),
    _item(
        "has_experience",
        "至少一段经历（实习/项目/竞赛任一）",
        5,
        "completeness",
        "有任一段经历=5；完全没有=0",
        [("exp_present", 5, "至少有一段实习/项目/竞赛经历"), ("exp_absent", 0, "完全没有经历")],
    ),
    _item(
        "skill_module",
        "技能模块存在且非空",
        4,
        "completeness",
        "存在且非空=4；不存在=0",
        [("skill_present", 4, "技能模块存在且非空"), ("skill_absent", 0, "不存在或为空")],
    ),
    _item(
        "relevant_courses",
        "相关课程（≥3门）",
        3,
        "completeness",
        "列出≥3门=3；未列出（或不足3门）=0",
        [("courses_ge3", 3, "列出至少3门相关课程"), ("courses_lt3", 0, "未列出或不足3门")],
    ),
    _item(
        "section_clarity",
        "模块分区明确",
        5,
        "clarity",
        "分区清晰=5；标题模糊=2；无分区=0",
        [
            ("section_clear", 5, "模块分区清晰、标题明确"),
            ("section_vague", 2, "有分区但标题模糊"),
            ("section_none", 0, "无明显分区"),
        ],
    ),
    _item(
        "timeline",
        "时间线倒序",
        4,
        "clarity",
        "倒序=4；乱序=0",
        [("timeline_desc", 4, "时间线为倒序"), ("timeline_chaos", 0, "时间线乱序")],
    ),
    _item(
        "exp_three_elements",
        "每段经历包含组织+角色+时间三要素",
        4,
        "clarity",
        "三要素齐全=4；每缺一类要素扣1.5（按整体缺失类数选档）",
        [
            ("elem_full", 4, "所有经历均含组织+角色+时间"),
            ("elem_miss1", 2, "整体缺一类要素"),
            ("elem_miss2", 1, "整体缺两类要素"),
            ("elem_miss3", 0, "三类要素普遍缺失"),
        ],
    ),
    _item(
        "length",
        "篇幅合理（应届生1页为佳）",
        3,
        "clarity",
        "1页左右=3；不足半页=1；超2页=0",
        [
            ("length_ok", 3, "篇幅约1页，合理"),
            ("length_short", 1, "不足半页"),
            ("length_long", 0, "超过2页"),
        ],
    ),
    _item(
        "bullet_usage",
        "使用Bullet Point而非大段文字",
        4,
        "clarity",
        "以bullet为主=4；纯段落叙述=0",
        [("bullet_yes", 4, "以 bullet point 组织内容"), ("bullet_no", 0, "纯段落叙述")],
    ),
    _item(
        "verb_start",
        "动词开头",
        8,
        "persuasiveness",
        "动词开头bullet占比：≥80%=8, ≥60%=5, ≥40%=3, ≥20%=2, <20%=1",
        [
            ("verb_ge80", 8, "动词开头占比 ≥80%"),
            ("verb_ge60", 5, "动词开头占比 ≥60%"),
            ("verb_ge40", 3, "动词开头占比 ≥40%"),
            ("verb_ge20", 2, "动词开头占比 ≥20%"),
            ("verb_lt20", 1, "动词开头占比 <20%"),
        ],
    ),
    _item(
        "quantification",
        "量化表达",
        10,
        "persuasiveness",
        "含数字bullet占比：≥50%=10, ≥30%=7, ≥15%=4, >0%=2, 0%=1",
        [
            ("quant_ge50", 10, "含数字 bullet 占比 ≥50%"),
            ("quant_ge30", 7, "含数字 bullet 占比 ≥30%"),
            ("quant_ge15", 4, "含数字 bullet 占比 ≥15%"),
            ("quant_gt0", 2, "含数字 bullet 占比 >0%"),
            ("quant_zero", 1, "完全无量化"),
        ],
    ),
    _item(
        "result_oriented",
        "结果导向",
        10,
        "persuasiveness",
        "有产出/成果bullet占比：≥60%=10, ≥40%=7, ≥20%=4, >0%=2, 0%=1",
        [
            ("result_ge60", 10, "有成果 bullet 占比 ≥60%"),
            ("result_ge40", 7, "有成果 bullet 占比 ≥40%"),
            ("result_ge20", 4, "有成果 bullet 占比 ≥20%"),
            ("result_gt0", 2, "有成果 bullet 占比 >0%"),
            ("result_zero", 1, "完全无成果导向"),
        ],
    ),
    _item(
        "specificity",
        "具体性（弱动词控制）",
        7,
        "persuasiveness",
        "弱动词（参与/负责/协助/帮助/了解/学习/熟悉）占比：0%=7, <20%=5, <40%=3, ≥40%=1",
        [
            ("weak_zero", 7, "无弱动词"),
            ("weak_lt20", 5, "弱动词占比 <20%"),
            ("weak_lt40", 3, "弱动词占比 <40%"),
            ("weak_ge40", 1, "弱动词占比 ≥40%"),
        ],
    ),
    _item(
        "self_eval",
        "自我评价质量",
        5,
        "persuasiveness",
        "含具体事实或清晰定位=5；无自我评价=3；纯形容词堆砌=1",
        [
            ("self_solid", 5, "含具体事实或清晰定位"),
            ("self_none", 3, "无自我评价"),
            ("self_empty", 1, "纯形容词堆砌"),
        ],
    ),
    _item(
        "typos",
        "无错别字/语法错误",
        5,
        "professionalism",
        "每处扣1分，最低0（按错误处数选档）",
        [
            ("typo_0", 5, "无错别字/语法错误"),
            ("typo_1", 4, "1处错误"),
            ("typo_2", 3, "2处错误"),
            ("typo_3", 2, "3处错误"),
            ("typo_4", 1, "4处错误"),
            ("typo_5plus", 0, "5处及以上错误"),
        ],
    ),
    _item(
        "format_consistency",
        "格式统一性",
        4,
        "professionalism",
        "明显不一致每处扣1分（按不一致处数选档）",
        [
            ("fmt_0", 4, "格式统一"),
            ("fmt_1", 3, "1处不一致"),
            ("fmt_2", 2, "2处不一致"),
            ("fmt_3", 1, "3处不一致"),
            ("fmt_4plus", 0, "4处及以上不一致"),
        ],
    ),
    _item(
        "email_pro",
        "邮箱专业性",
        2,
        "professionalism",
        "正常=2；纯qq数字邮箱扣1；含不雅昵称扣2",
        [
            ("email_ok", 2, "邮箱专业"),
            ("email_qq", 1, "纯 qq 数字邮箱"),
            ("email_bad", 0, "含不雅昵称"),
        ],
    ),
    _item(
        "no_improper",
        "无不当内容",
        2,
        "professionalism",
        "无不当内容=2；高中经历扣1/星座血型扣1/身份证号扣2，最多扣2（按累计扣分选档）",
        [
            ("improper_0", 2, "无不当内容"),
            ("improper_1", 1, "存在轻度不当（高中经历/星座血型等，累计扣1）"),
            ("improper_2", 0, "存在严重不当（身份证号等，累计扣2）"),
        ],
    ),
    _item(
        "skill_claim",
        "技能描述合理性",
        2,
        "professionalism",
        "应届生用'精通'：0~1次=2；2次扣1；≥3次扣2",
        [
            ("claim_ok", 2, "'精通'使用 0~1 次"),
            ("claim_2", 1, "'精通'使用 2 次"),
            ("claim_3plus", 0, "'精通'使用 ≥3 次"),
        ],
    ),
)
ITEMS = {item.id: item for item in RUBRIC}


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class Education(StrictModel):
    university: str | None
    degree: str | None
    major: str | None
    graduation_date: str | None
    gpa: str | None
    gpa_rank: str | None
    relevant_courses: list[str]


class SkillCategories(StrictModel):
    programming_languages: list[str]
    frameworks: list[str]
    tools: list[str]
    databases: list[str]
    certificates: list[str]
    languages: list[str]
    other: list[str]


class ExperienceSummary(StrictModel):
    internship_count: int = Field(ge=0)
    project_count: int = Field(ge=0)
    competition_count: int = Field(ge=0)
    paper_count: int = Field(ge=0)


class CandidateProfile(StrictModel):
    name: str | None
    phone: str | None
    email: str | None
    target_city: str | None
    education: Education
    skill_tags: list[str]
    skill_categories: SkillCategories
    experience_summary: ExperienceSummary
    experience_tags: list[str]
    experience_industries: list[str]
    inferred_target_roles: list[str]
    highlights: list[str]


class RiskFlag(StrictModel):
    type: str = Field(min_length=1)
    detail: str = Field(min_length=1)
    suggestion: str = Field(min_length=1)


class StyleDetection(StrictModel):
    style: Literal["standard", "creative", "non_standard"] = "standard"
    risk_flags: list[RiskFlag] = Field(default_factory=list)


class ItemAssessment(StrictModel):
    item_id: str
    band_id: str
    status: Literal["pass", "warn", "fail"] = "warn"
    note: str = ""


class RawSuggestion(StrictModel):
    related_item_id: str | None = None
    priority: int = Field(ge=1)
    severity: Literal["critical", "important", "minor"]
    color: Literal["red", "green", "blue"]
    dimension: str
    item: str
    problem: str
    recommendation: str = ""
    time_horizon: Literal["immediate", "medium_term"] = "immediate"
    gap_type: Literal[
        "resume_evidence",
        "internship",
        "project",
        "competition",
        "award",
        "certificate",
        "skill",
        "education",
        "other",
    ] = "other"
    resume_text: str | None = None
    suggested_text: str | None = None
    context_before: str | None = None
    context_after: str | None = None
    effort: Literal["easy", "medium", "hard"]

    @model_validator(mode="after")
    def valid_edit_evidence(self):
        if self.color in {"red", "blue"} and not self.resume_text:
            raise ValueError("red/blue suggestions require exact resume_text")
        if self.color in {"green", "blue"} and not (self.suggested_text or self.recommendation):
            raise ValueError("green/blue suggestions require suggested text")
        return self


class RawAnalysis(StrictModel):
    parse_success: bool
    parse_error: str | None = None
    candidate_profile: CandidateProfile
    item_assessments: list[ItemAssessment]
    suggestions: list[RawSuggestion]
    one_line_summary: str = Field(min_length=1, max_length=100)
    style_detection: StyleDetection

    @model_validator(mode="after")
    def exact_rubric_coverage(self):
        if not self.parse_success:
            return self
        ids = [assessment.item_id for assessment in self.item_assessments]
        if len(ids) != len(set(ids)):
            raise ValueError("duplicate rubric item_id")
        expected = set(ITEMS)
        if set(ids) != expected:
            missing = expected - set(ids)
            extra = set(ids) - expected
            raise ValueError(f"rubric coverage mismatch: missing={missing}, extra={extra}")
        for assessment in self.item_assessments:
            allowed = {band.id for band in ITEMS[assessment.item_id].bands}
            if assessment.band_id not in allowed:
                raise ValueError(
                    f"band {assessment.band_id} does not belong to {assessment.item_id}"
                )
        return self


def grade_from_score(score: float) -> str:
    if score >= 90:
        return "A"
    if score >= 80:
        return "B+"
    if score >= 70:
        return "B"
    if score >= 60:
        return "C"
    return "D"


def compute_analysis(raw: RawAnalysis | dict) -> dict:
    raw = raw if isinstance(raw, RawAnalysis) else RawAnalysis.model_validate(raw)
    selected = {assessment.item_id: assessment for assessment in raw.item_assessments}
    dimensions = {
        key: {"score": 0, "max": maximum, "details": []} for key, maximum in DIMENSION_MAX.items()
    }
    item_scores: dict[str, int] = {}
    for item in RUBRIC:
        assessment = selected.get(item.id)
        band = next(
            (band for band in item.bands if assessment and band.id == assessment.band_id), None
        )
        score = band.score if band and raw.parse_success else 0
        item_scores[item.id] = score
        dimensions[item.dimension]["score"] += score
        dimensions[item.dimension]["details"].append(
            {
                "itemId": item.id,
                "item": item.item,
                "score": score,
                "max": item.max,
                "status": assessment.status if assessment and raw.parse_success else "warn",
                "note": assessment.note
                if assessment and raw.parse_success
                else "解析失败，按0分计",
                "bandId": assessment.band_id if assessment and raw.parse_success else None,
            }
        )
    total = round(sum(value["score"] for value in dimensions.values()))
    severity_priority = {"critical": "高", "important": "中", "minor": "低"}
    dimension_category = {
        "completeness": "内容",
        "clarity": "结构",
        "persuasiveness": "表达",
        "professionalism": "格式",
    }
    suggestions = []
    for suggestion in raw.suggestions:
        related = ITEMS.get(suggestion.related_item_id or "")
        suggestions.append(
            {
                "category": dimension_category.get(
                    suggestion.dimension, suggestion.dimension or "其他"
                ),
                "priority": severity_priority[suggestion.severity],
                "priorityNumber": suggestion.priority,
                "severity": suggestion.severity,
                "issue": suggestion.problem,
                "recommendation": suggestion.recommendation or suggestion.suggested_text or "",
                "timeHorizon": suggestion.time_horizon,
                "gapType": suggestion.gap_type,
                "relatedItemId": suggestion.related_item_id,
                "scoreImpact": related.max - item_scores[related.id] if related else 0,
                "color": suggestion.color,
                "resumeText": suggestion.resume_text,
                "suggestedText": suggestion.suggested_text,
                "contextBefore": suggestion.context_before,
                "contextAfter": suggestion.context_after,
                "effort": suggestion.effort,
            }
        )
    return {
        "parse_success": raw.parse_success,
        "parse_error": raw.parse_error,
        "scoring": {
            "total_score": total,
            "grade": grade_from_score(total),
            "one_line_summary": raw.one_line_summary,
            "dimensions": dimensions,
        },
        "suggestions": suggestions,
        "style_detection": raw.style_detection.model_dump(),
        "candidate_profile": raw.candidate_profile.model_dump(),
    }


def render_rubric_for_prompt() -> str:
    sections = []
    for dimension in DIMENSION_MAX:
        lines = []
        for item in (entry for entry in RUBRIC if entry.dimension == dimension):
            bands = " / ".join(f"`{band.id}`({band.desc})" for band in item.bands)
            lines.append(f"- **{item.id}** {item.item}｜判定: {item.rule}\n  可选档位: {bands}")
        sections.append(
            f"### {DIMENSION_LABEL[dimension]}（{DIMENSION_MAX[dimension]}分）\n" + "\n".join(lines)
        )
    return "\n\n".join(sections)


def build_resume_analysis_prompt(resume_text: str) -> str:
    return f"""你是一个面向应届毕业生的简历分析引擎。只评价简历表达质量，不评价候选人能力。
你只报告每项命中的 band_id，绝不输出分数。系统将按代码权威评分表计算分数。
必须覆盖全部 item_id，每项恰好一次且 band_id 必须属于该项。计数类在 note 中写客观计数。
创意风格只提示 ATS 风险，不因非标准排版本身扣档。

建议必须诚实、具体且可执行；不能建议用户编造。需要新增用 green，改写用 blue，删除用 red。
能力或经历缺口可给 medium_term 建议，投递前修改用 immediate。可关注实习、项目、竞赛、奖项、证书。

候选人画像必须完整输出 contact、education、skill_tags/categories、
experience_summary/tags/industries、
inferred_target_roles 和 highlights。无法提取用 null 或空数组，不得编造。
输入不是简历时 parse_success=false；这是唯一允许省略逐项覆盖的情况，系统会强制总分为0。

评分表：
{render_rubric_for_prompt()}

待分析简历：
{resume_text or "（简历内容为空）"}
"""


SCORE_TABLE = {
    "plus": {
        "hard": {"hit": 18, "partial": 9, "missing": 0},
        "must": {"hit": 12, "partial": 6, "missing": 0},
        "nice": {"hit": 6, "partial": 3, "missing": 0},
    },
    "minus": {
        "hard": {"hit": 0, "partial": -12, "missing": -25},
        "must": {"hit": 0, "partial": -7, "missing": -14},
        "nice": {"hit": 0, "partial": -2, "missing": -5},
    },
}
SCREEN_HARD_EXCLUDE = -100000
SCREEN_DEGREE_SCORE = {"ok": 12, "over": 12, "below": -25, "na": 0}
SCREEN_MAJOR_SCORE = {"match": 12, "related": 5, "mismatch": -10, "na": 0}
SCREEN_SKILL_SCORE = {"strong": 12, "weak": 5, "none": -6, "na": 0}


def lookup_delta(kind: str, weight: str, status: str) -> int:
    return SCORE_TABLE.get(kind, {}).get(weight, {}).get(status, 0)


def grade_from_match_score(score: float) -> str:
    if score >= 60:
        return "A"
    if score >= 35:
        return "B+"
    if score >= 15:
        return "B"
    if score >= 0:
        return "C"
    return "D"


GRADE_VERDICT = {
    "A": "强烈推荐投递",
    "B+": "推荐投递",
    "B": "可以考虑",
    "C": "谨慎评估",
    "D": "不建议投递",
}


def compute_screen_score(degree: str, major: str, skill: str) -> int:
    if degree == "below":
        return SCREEN_HARD_EXCLUDE
    return (
        SCREEN_DEGREE_SCORE.get(degree, 0)
        + SCREEN_MAJOR_SCORE.get(major, 0)
        + SCREEN_SKILL_SCORE.get(skill, 0)
    )


def render_match_scoring_for_prompt() -> str:
    return """评分规则（你只负责裁决，分数由系统按下表计算，你绝不要输出任何分数）：
- kind：plus=候选人命中或具备；minus=岗位明确要求但候选人欠缺或不满足
- weight：hard=硬性门槛；must=岗位核心必需能力；nice=明确加分项
- status：hit=完全满足；partial=部分满足；missing=完全缺失或明确不满足
【plus】hard +18/+9/0；must +12/+6/0；nice +6/+3/0（hit/partial/missing）
【minus】hard 0/-12/-25；must 0/-7/-14；nice 0/-2/-5（hit/partial/missing）
总分从0开始，可为负且不设上限。只有岗位原文明示的要求才可产生 minus。
与岗位无关或岗位未要求的内容不要生成 annotation，既不加分也不扣分。"""
