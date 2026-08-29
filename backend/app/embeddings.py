"""Semantic embedding helpers for resume↔JD recall and ranking.

This module implements the Resume2Vec-style layer: resume and job description
texts are encoded into a shared vector space and compared with cosine
similarity. It is deliberately a *recall* signal, not a final score — the
final match score remains the deterministic LLM-adjudicated table in
``app/scoring.py``.

Everything here degrades gracefully: when no embedding-capable provider is
configured, callers fall back to the existing LLM-only screening path.
"""

from __future__ import annotations

import math

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import decrypt_secret
from app.integrations import OpenAIClient
from app.models import LlmGlobalSetting, LlmProvider


def cosine_similarity(vec_a: list[float], vec_b: list[float]) -> float:
    """Cosine similarity between two vectors of equal length."""
    if not vec_a or not vec_b or len(vec_a) != len(vec_b):
        return 0.0
    dot = sum(a * b for a, b in zip(vec_a, vec_b, strict=True))
    norm_a = math.sqrt(sum(a * a for a in vec_a))
    norm_b = math.sqrt(sum(b * b for b in vec_b))
    if norm_a == 0.0 or norm_b == 0.0:
        return 0.0
    return dot / (norm_a * norm_b)


async def embed_texts(client: OpenAIClient, texts: list[str]) -> list[list[float]]:
    """Encode ``texts`` into embedding vectors, preserving input order."""
    return await client.embeddings(texts)


async def embedding_client(
    request: Request, db: AsyncSession, provider_id: str | None = None
) -> OpenAIClient | None:
    """Resolve an embedding-capable provider into an ``OpenAIClient``.

    Returns ``None`` when no embedding provider is configured or enabled, so
    callers can fall back to the LLM-only path without raising.
    """
    provider: LlmProvider | None = None
    if provider_id:
        provider = await db.get(LlmProvider, provider_id)
    else:
        global_row = await db.get(LlmGlobalSetting, 1)
        default_id = global_row.default_embedding_provider_id if global_row else "dashscope"
        provider = await db.get(LlmProvider, default_id)

    if not provider or not provider.enabled or not provider.supports_embedding:
        return None
    if not provider.embedding_model:
        return None
    key = decrypt_secret(
        provider.api_key_ciphertext,
        provider.api_key_nonce,
        request.app.state.settings.jwt_secret,
    )
    return OpenAIClient(provider.base_url, key, provider.embedding_model)
