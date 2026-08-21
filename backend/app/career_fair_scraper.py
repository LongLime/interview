from __future__ import annotations

import asyncio
import base64
import hashlib
import html
import re
import zlib
from collections.abc import AsyncIterator
from datetime import datetime
from urllib.parse import urljoin, urlparse

import requests


class CqbysCareerFairCrawler:
    """Fetch recent CQBYS teach-ins through the site's static HTML fallback."""

    base_url = "https://www.cqbys.com/teachin"
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        ),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    }

    async def crawl(self, max_pages: int = 3) -> AsyncIterator[dict]:
        for page in range(1, max_pages + 1):
            url = f"{self.base_url}?keyword=&universityid=&type=&time=60&page={page}"
            yield {"type": "progress", "page": page, "message": f"正在抓取第 {page} 页"}
            try:
                response = await asyncio.to_thread(
                    requests.get, url, headers=self.headers, timeout=25
                )
                response.raise_for_status()
                records, has_next_page = self.parse_list(response.text)
            except requests.RequestException as exc:
                yield {"type": "error", "page": page, "message": f"第 {page} 页请求失败: {exc}"}
                return

            if not records:
                yield {"type": "complete", "page": page, "records": [], "message": "没有更多宣讲会"}
                return

            enriched = await asyncio.gather(*(self.enrich(record) for record in records))
            yield {"type": "data", "page": page, "records": enriched}
            if not has_next_page:
                break

    async def enrich(self, record: dict) -> dict:
        detail_url = record["source_url"]
        try:
            response = await asyncio.to_thread(
                requests.get, detail_url, headers=self.headers, timeout=25
            )
            response.raise_for_status()
            details = self.parse_detail(response.text, response.url)
            return {**record, **{key: value for key, value in details.items() if value}}
        except requests.RequestException as exc:
            return {**record, "description": "", "detail_error": str(exc)}

    def parse_list(self, page_html: str) -> tuple[list[dict], bool]:
        list_html = self._decode_embedded_html(page_html) or page_html
        records: list[dict] = []
        blocks = re.findall(r"<ul[^>]*>(.*?)</ul>", list_html, re.S | re.I)
        for block in blocks:
            cells = re.findall(r"<li[^>]*>(.*?)</li>", block, re.S | re.I)
            if len(cells) < 4:
                continue
            link = re.search(
                r"<a[^>]*href=[\"']([^\"']+)[\"'][^>]*>(.*?)</a>",
                cells[0],
                re.S | re.I,
            )
            if not link:
                continue
            title = self._clean_html(link.group(2))
            if not title or title == "单位名称":
                continue
            source_url = self._safe_url(html.unescape(link.group(1)))
            if not source_url:
                continue
            record_id = re.search(r"/view/id/(\d+)", source_url)
            fair_date, start_time, end_time = self._parse_schedule(self._clean_html(cells[3]))
            external_id = (
                f"cqbys_{record_id.group(1)}"
                if record_id
                else f"cqbys_{hashlib.sha256(source_url.encode()).hexdigest()[:16]}"
            )
            records.append(
                {
                    "external_id": external_id,
                    "title": title,
                    "company_name": title,
                    "university_name": self._clean_html(cells[1]),
                    "venue": self._clean_html(cells[2]),
                    "schedule": self._clean_html(cells[3]),
                    "fair_date": fair_date,
                    "start_time": start_time,
                    "end_time": end_time,
                    "source_url": source_url,
                }
            )
        has_next_page = bool(
            re.search(
                r"[?&]page=\d+[^\"']*[\"'][^>]*>\s*(?:下一页|&gt;|>)",
                list_html,
                re.S | re.I,
            )
        )
        return records, has_next_page

    def parse_detail(self, page_html: str, page_url: str) -> dict:
        title_match = re.search(
            r'<div[^>]*class=["\'][^"\']*details-title[^"\']*["\'][^>]*>.*?<h[1-6][^>]*>(.*?)</h[1-6]>',
            page_html,
            re.S | re.I,
        )
        metadata = self._metadata(page_html)
        content = self._clean_html(self._decode_embedded_html(page_html) or page_html)
        date_value, start_time, end_time = self._parse_schedule(
            metadata.get("举办时间") or metadata.get("预定开放时间") or ""
        )
        return {
            "title": self._clean_html(title_match.group(1)) if title_match else "",
            "venue": metadata.get("举办地址") or "",
            "fair_date": date_value,
            "start_time": start_time,
            "end_time": end_time,
            "description": content,
        }

    def _metadata(self, page_html: str) -> dict[str, str]:
        result: dict[str, str] = {}
        list_match = re.search(
            r'<div[^>]*class=["\'][^"\']*details-list[^"\']*["\'][^>]*>(.*?)<div[^>]*class=["\'][^"\']*details-mge',
            page_html,
            re.S | re.I,
        )
        if not list_match:
            return result
        for item in re.findall(r"<li[^>]*>(.*?)</li>", list_match.group(1), re.S | re.I):
            text = self._clean_html(item)
            match = re.match(r"([^：:]+)[：:]\s*(.*)", text)
            if match:
                result[match.group(1).strip()] = match.group(2).strip()
        page_text = self._clean_html(page_html)
        labels = ("招聘会类型", "预定开放时间", "举办地址", "举办时间", "主办单位", "承办单位")
        for label in labels:
            if label in result:
                continue
            match = re.search(
                rf"{label}[：:]\s*(.*?)(?=(?:{'|'.join(labels)})[：:]|详情|$)",
                page_text,
            )
            if match:
                result[label] = match.group(1).strip()
        return result

    @staticmethod
    def _parse_schedule(value: str) -> tuple[str | None, str | None, str | None]:
        date_match = re.search(r"(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})", value)
        if not date_match:
            return None, None, None
        year, month, day = (int(part) for part in date_match.groups())
        try:
            fair_date = datetime(year, month, day).date().isoformat()
        except ValueError:
            return None, None, None
        times = re.findall(r"\b([0-2]?\d:[0-5]\d)\b", value)
        return fair_date, (times[0] if times else None), (times[1] if len(times) > 1 else None)

    def _safe_url(self, raw_url: str) -> str:
        resolved = urljoin("https://www.cqbys.com", raw_url.strip())
        parsed = urlparse(resolved)
        if parsed.scheme != "https" or parsed.hostname not in {"cqbys.com", "www.cqbys.com"}:
            return ""
        return resolved

    @staticmethod
    def _decode_embedded_html(page_html: str) -> str:
        match = re.search(
            r'Base64\.decode\(unzip\("([^"]+)"\)\.substr\((\d+)\)\)\.substr\((\d+)\)',
            page_html,
        )
        if not match:
            return ""
        payload, first_offset, second_offset = match.groups()
        compressed = base64.b64decode(payload)
        try:
            inflated = zlib.decompress(compressed)
        except zlib.error:
            inflated = zlib.decompress(compressed, -zlib.MAX_WBITS)
        intermediate = inflated.decode("utf-8", errors="replace")[int(first_offset) :]
        decoded = base64.b64decode(intermediate).decode("utf-8", errors="replace")
        return decoded[int(second_offset) :]

    @staticmethod
    def _clean_html(value: str) -> str:
        text = re.sub(r"<[^>]+>", " ", value)
        return re.sub(r"\s+", " ", html.unescape(text)).strip()