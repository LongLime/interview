from __future__ import annotations

import io
import json
from collections.abc import Iterable
from datetime import datetime
from typing import Any

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

FONT_NAME = "STSong-Light"
pdfmetrics.registerFont(UnicodeCIDFont(FONT_NAME))


def _text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _json_list(value: str | None) -> list[Any]:
    try:
        parsed = json.loads(value or "[]")
    except (TypeError, json.JSONDecodeError):
        return []
    return parsed if isinstance(parsed, list) else []


def _date(value: datetime | None) -> str:
    return value.strftime("%Y-%m-%d %H:%M:%S") if value else "未知"


def _document(
    title: str,
) -> tuple[io.BytesIO, SimpleDocTemplate, list[Any], dict[str, ParagraphStyle]]:
    output = io.BytesIO()
    document = SimpleDocTemplate(
        output,
        pagesize=A4,
        rightMargin=18 * mm,
        leftMargin=18 * mm,
        topMargin=16 * mm,
        bottomMargin=16 * mm,
        title=title,
    )
    base = getSampleStyleSheet()
    styles = {
        "title": ParagraphStyle(
            "CjkTitle", parent=base["Title"], fontName=FONT_NAME, alignment=TA_CENTER
        ),
        "heading": ParagraphStyle(
            "CjkHeading",
            parent=base["Heading2"],
            fontName=FONT_NAME,
            textColor=colors.HexColor("#34495e"),
        ),
        "body": ParagraphStyle("CjkBody", parent=base["BodyText"], fontName=FONT_NAME, leading=17),
    }
    return output, document, [Paragraph(_text(title), styles["title"])], styles


def _section(story: list[Any], styles: dict[str, ParagraphStyle], title: str) -> None:
    story.extend((Spacer(1, 4 * mm), Paragraph(_text(title), styles["heading"])))


def _lines(story: list[Any], style: ParagraphStyle, values: Iterable[str]) -> None:
    story.extend(Paragraph(_text(value), style) for value in values)


def resume_pdf(resume: Any, analysis: Any) -> bytes:
    output, document, story, styles = _document("简历分析报告")
    _section(story, styles, "基本信息")
    _lines(
        story,
        styles["body"],
        (f"文件名: {resume.original_filename}", f"上传时间: {_date(resume.uploaded_at)}"),
    )
    _section(story, styles, "综合评分")
    _lines(story, styles["body"], (f"总分: {analysis.overall_score or 0} / 100",))
    score_data = [
        ["内容完整性", analysis.content_score or 0],
        ["结构清晰度", analysis.structure_score or 0],
        ["技能匹配度", analysis.skill_match_score or 0],
        ["表达专业性", analysis.expression_score or 0],
        ["项目经验", analysis.project_score or 0],
    ]
    table = Table(score_data, colWidths=(90 * mm, 35 * mm))
    table.setStyle(
        TableStyle(
            [
                ("FONTNAME", (0, 0), (-1, -1), FONT_NAME),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#bdc3c7")),
                ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#ecf0f1")),
                ("PADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    story.append(table)
    if analysis.summary:
        _section(story, styles, "简历摘要")
        _lines(story, styles["body"], (analysis.summary,))
    strengths = _json_list(analysis.strengths_json)
    if strengths:
        _section(story, styles, "优势亮点")
        _lines(story, styles["body"], (f"• {item}" for item in strengths))
    suggestions = _json_list(analysis.suggestions_json)
    if suggestions:
        _section(story, styles, "改进建议")
        for item in suggestions:
            if isinstance(item, dict):
                priority = item.get("priority", "")
                category = item.get("category", "")
                issue = item.get("issue", "")
                recommendation = item.get("recommendation", "")
                _lines(
                    story,
                    styles["body"],
                    (f"【{priority}】{category}", f"问题: {issue}", f"建议: {recommendation}"),
                )
            else:
                _lines(story, styles["body"], (f"• {item}",))
    document.build(story)
    return output.getvalue()


def interview_pdf(session: Any) -> bytes:
    output, document, story, styles = _document("模拟面试报告")
    _section(story, styles, "面试信息")
    _lines(
        story,
        styles["body"],
        (
            f"会话ID: {session.session_id}",
            f"题目数量: {session.total_questions}",
            f"面试状态: {session.status}",
            f"开始时间: {_date(session.created_at)}",
            f"完成时间: {_date(session.completed_at)}",
        ),
    )
    if session.overall_score is not None:
        _section(story, styles, "综合评分")
        _lines(story, styles["body"], (f"总分: {session.overall_score} / 100",))
    if session.overall_feedback:
        _section(story, styles, "总体评价")
        _lines(story, styles["body"], (session.overall_feedback,))
    for title, value in (
        ("表现优势", session.strengths_json),
        ("改进建议", session.improvements_json),
    ):
        items = _json_list(value)
        if items:
            _section(story, styles, title)
            _lines(story, styles["body"], (f"• {item}" for item in items))
    if session.answers:
        _section(story, styles, "问答详情")
        for answer in sorted(session.answers, key=lambda item: item.question_index):
            _lines(
                story,
                styles["body"],
                (
                    f"问题 {answer.question_index + 1} [{answer.category or '综合'}]",
                    f"Q: {answer.question}",
                    f"A: {answer.user_answer or '未回答'}",
                    f"得分: {answer.score or 0}/100",
                    f"评价: {answer.feedback or ''}",
                    f"参考答案: {answer.reference_answer or ''}",
                ),
            )
            story.append(Spacer(1, 2 * mm))
    document.build(story)
    return output.getvalue()
