from __future__ import annotations

import json
from collections.abc import AsyncIterator
from typing import Any

import httpx

from app.core import BusinessError


class OpenAIClient:
    def __init__(
        self,
        base_url: str,
        api_key: str | None,
        model: str,
        timeout: float = 180,
        enable_thinking: bool = False,
    ):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.model = model
        self.timeout = timeout
        self.enable_thinking = enable_thinking

    def _is_aliyun(self) -> bool:
        host = self.base_url.lower()
        return any(marker in host for marker in ("aliyun", "dashscope", "bailian"))

    def _apply_aliyun_options(self, payload: dict[str, Any]) -> None:
        # qwen3.5-flash 等推理模型默认开启思考模式，会显著拖慢结构化输出
        # 并可能触发超时。对阿里云系 provider 显式关闭 thinking，加快响应。
        if not self.enable_thinking and self._is_aliyun():
            payload["enable_thinking"] = False

    def _headers(self) -> dict[str, str]:
        if not self.api_key:
            raise BusinessError(7001, "AI Provider未配置API Key")
        return {"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"}

    async def complete_json(
        self, messages: list[dict[str, str]], schema: dict[str, Any] | None = None
    ) -> dict:
        data, _usage = await self.complete_json_with_usage(messages, schema)
        return data

    async def complete_json_with_usage(
        self, messages: list[dict[str, str]], schema: dict[str, Any] | None = None
    ) -> tuple[dict, dict[str, int]]:
        payload: dict[str, Any] = {"model": self.model, "messages": messages, "temperature": 0}
        self._apply_aliyun_options(payload)
        if schema:
            if self._supports_json_schema():
                payload["response_format"] = {
                    "type": "json_schema",
                    "json_schema": {"name": "response", "strict": True, "schema": schema},
                }
            else:
                payload["response_format"] = {"type": "json_object"}
                payload["messages"] = [
                    *messages,
                    {
                        "role": "system",
                        "content": (
                            "只输出符合以下 JSON Schema 的 JSON 对象，不要使用 Markdown 代码块：\n"
                            + json.dumps(schema, ensure_ascii=False)
                        ),
                    },
                ]
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    f"{self.base_url}/chat/completions", headers=self._headers(), json=payload
                )
                if response.is_error:
                    detail = self._error_detail(response)
                    raise BusinessError(7003, f"AI服务调用失败: {detail}")
                body = response.json()
                content = body["choices"][0]["message"]["content"]
                if content.startswith("```"):
                    content = content.strip("`").removeprefix("json").strip()
                usage = body.get("usage") or {}
                return json.loads(content), {
                    "prompt_tokens": int(usage.get("prompt_tokens") or 0),
                    "completion_tokens": int(usage.get("completion_tokens") or 0),
                    "total_tokens": int(usage.get("total_tokens") or 0),
                }
        except BusinessError:
            raise
        except httpx.TimeoutException as exc:
            message = f"AI服务调用超时（{self.timeout:.0f}秒），请稍后重试"
            raise BusinessError(7003, message) from exc
        except (httpx.HTTPError, KeyError, ValueError, json.JSONDecodeError) as exc:
            detail = str(exc) or type(exc).__name__
            raise BusinessError(7003, f"AI服务调用失败: {detail}") from exc

    def _supports_json_schema(self) -> bool:
        model = self.model.lower()
        return any(version in model for version in ("qwen3.7", "qwen3.8")) and any(
            family in model for family in ("plus", "max")
        )

    @staticmethod
    def _error_detail(response: httpx.Response) -> str:
        try:
            body = response.json()
            error = body.get("error", body)
            if isinstance(error, dict):
                return str(error.get("message") or error.get("code") or error)
            return str(error)
        except (ValueError, AttributeError):
            return response.text[:500] or f"HTTP {response.status_code}"

    async def stream_text(self, messages: list[dict[str, str]]) -> AsyncIterator[str]:
        payload = {"model": self.model, "messages": messages, "temperature": 0, "stream": True}
        self._apply_aliyun_options(payload)
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                async with client.stream(
                    "POST",
                    f"{self.base_url}/chat/completions",
                    headers=self._headers(),
                    json=payload,
                ) as response:
                    response.raise_for_status()
                    async for line in response.aiter_lines():
                        if not line.startswith("data: ") or line == "data: [DONE]":
                            continue
                        data = json.loads(line[6:])
                        if not isinstance(data, dict):
                            continue
                        error = data.get("error")
                        if error:
                            detail = (
                                error.get("message", str(error))
                                if isinstance(error, dict)
                                else str(error)
                            )
                            raise BusinessError(7003, f"AI流式调用失败: {detail}")
                        choices = data.get("choices")
                        if not isinstance(choices, list) or not choices:
                            continue
                        choice = choices[0]
                        if not isinstance(choice, dict):
                            continue
                        delta = choice.get("delta") or {}
                        if not isinstance(delta, dict):
                            continue
                        chunk = delta.get("content")
                        if isinstance(chunk, str) and chunk:
                            yield chunk
        except BusinessError:
            raise
        except (httpx.HTTPError, KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
            detail = str(exc) or type(exc).__name__
            raise BusinessError(7003, f"AI流式调用失败: {detail}") from exc

    async def embeddings(self, texts: list[str]) -> list[list[float]]:
        """Encode ``texts`` into embeddings via the OpenAI-compatible /embeddings endpoint.

        Returns one vector per input text, preserving input order. The model
        used is ``self.model`` — callers should construct a dedicated client
        bound to an embedding model (see ``app.embeddings.embedding_client``).
        """
        if not texts:
            return []
        payload: dict[str, Any] = {"model": self.model, "input": texts}
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    f"{self.base_url}/embeddings", headers=self._headers(), json=payload
                )
                if response.is_error:
                    detail = self._error_detail(response)
                    raise BusinessError(7003, f"Embedding调用失败: {detail}")
                body = response.json()
                data = body.get("data") or []
                ordered = sorted(
                    (item for item in data if isinstance(item, dict)),
                    key=lambda item: int(item.get("index", 0)),
                )
                return [item.get("embedding") or [] for item in ordered]
        except BusinessError:
            raise
        except (httpx.HTTPError, KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
            detail = str(exc) or type(exc).__name__
            raise BusinessError(7003, f"Embedding调用失败: {detail}") from exc
