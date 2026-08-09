from __future__ import annotations

import base64
import hashlib
from datetime import UTC, datetime, timedelta
from functools import lru_cache
from pathlib import Path
from typing import Any, Generic, TypeVar

import jwt
from cryptography.fernet import Fernet, InvalidToken
from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pwdlib import PasswordHash
from pwdlib.hashers.argon2 import Argon2Hasher
from pwdlib.hashers.bcrypt import BcryptHasher
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db

ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=ROOT / ".env", env_file_encoding="utf-8", extra="ignore"
    )

    app_name: str = "InterviewGuide API"
    debug: bool = False
    database_url: str | None = None
    postgres_host: str = "localhost"
    postgres_port: int = 5432
    postgres_db: str = "interview_guide"
    postgres_user: str = "postgres"
    postgres_password: str = "password"
    redis_url: str = "redis://localhost:6379/0"
    jwt_secret: str = "change-me-in-production-at-least-32-bytes"
    jwt_expire_minutes: int = 1440
    cors_allowed_origins: str = (
        "http://localhost:5173,http://127.0.0.1:5173,"
        "http://localhost:5174,http://127.0.0.1:5174,http://localhost"
    )
    app_storage_endpoint: str | None = None
    app_storage_access_key: str | None = None
    app_storage_secret_key: str | None = None
    app_storage_bucket: str = "interview-guide"
    app_storage_region: str = "us-east-1"
    ai_bailian_api_key: str | None = None
    ai_model: str = "qwen3.5-flash"
    ai_base_url: str = "https://dashscope.aliyuncs.com/compatible-mode/v1"
    scrapling_api_url: str | None = None
    auto_create_tables: bool = False

    @property
    def sqlalchemy_url(self) -> str:
        if self.database_url:
            return self.database_url
        return (
            f"postgresql+asyncpg://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    @property
    def origins(self) -> list[str]:
        origins = {value.strip() for value in self.cors_allowed_origins.split(",") if value.strip()}
        for origin in tuple(origins):
            if "localhost" in origin:
                origins.add(origin.replace("localhost", "127.0.0.1"))
            elif "127.0.0.1" in origin:
                origins.add(origin.replace("127.0.0.1", "localhost"))
        return sorted(origins)


@lru_cache
def get_settings() -> Settings:
    return Settings()


class ApiModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel, populate_by_name=True, from_attributes=True, extra="forbid"
    )


T = TypeVar("T")


class Result(ApiModel, Generic[T]):
    code: int = 200
    message: str = "success"
    data: T | None = None

    @classmethod
    def ok(cls, data: T | None = None, message: str = "success") -> Result[T]:
        return cls(data=data, message=message)

    @classmethod
    def error(cls, code: int, message: str) -> Result[Any]:
        return cls(code=code, message=message, data=None)


class BusinessError(Exception):
    def __init__(self, code: int, message: str):
        self.code = code
        self.message = message
        super().__init__(message)


# Keep Argon2 as the default while accepting BCrypt hashes created by Spring Security.
password_hash = PasswordHash((Argon2Hasher(), BcryptHasher()))
bearer = HTTPBearer(auto_error=False)


def _fernet(secret: str) -> Fernet:
    key = base64.urlsafe_b64encode(hashlib.sha256(secret.encode()).digest())
    return Fernet(key)


def encrypt_secret(value: str, secret: str) -> tuple[str, str]:
    return _fernet(secret).encrypt(value.encode()).decode(), "fernet-v1"


def decrypt_secret(value: str, nonce: str, secret: str) -> str:
    if nonce == "plain":
        return value
    if nonce != "fernet-v1":
        raise BusinessError(7007, "Provider密钥使用了不兼容的加密格式，请重新保存")
    try:
        return _fernet(secret).decrypt(value.encode()).decode()
    except InvalidToken as exc:
        raise BusinessError(7007, "Provider密钥无法解密，请重新保存") from exc


def create_token(user_id: int, username: str, settings: Settings) -> str:
    now = datetime.now(UTC)
    payload = {
        "sub": str(user_id),
        "username": username,
        "iat": now,
        "exp": now + timedelta(minutes=settings.jwt_expire_minutes),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


async def current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    session: AsyncSession = Depends(get_db),
):
    from app.models import AppUser

    if not credentials:
        raise BusinessError(401, "未登录或登录已过期")
    settings: Settings = request.app.state.settings
    try:
        payload = jwt.decode(credentials.credentials, settings.jwt_secret, algorithms=["HS256"])
        user_id = int(payload["sub"])
    except (jwt.PyJWTError, KeyError, ValueError) as exc:
        raise BusinessError(401, "无效的访问令牌") from exc
    user = await session.scalar(
        select(AppUser).where(AppUser.id == user_id, AppUser.enabled.is_(True))
    )
    if user is None:
        raise BusinessError(401, "用户不存在或已禁用")
    return user
