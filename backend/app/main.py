from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, WebSocket
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.api import router, voice_websocket
from app.core import BusinessError, Result, Settings, get_settings
from app.database import make_engine
from app.match_api import router as match_router
from app.matching import MatchTaskManager
from app.models import Base


def create_app(config: Settings | None = None) -> FastAPI:
    settings = config or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        if settings.auto_create_tables:
            async with app.state.engine.begin() as connection:
                await connection.run_sync(Base.metadata.create_all)
        yield
        await app.state.engine.dispose()

    app = FastAPI(title=settings.app_name, version="0.1.0", lifespan=lifespan)
    app.state.settings = settings
    app.state.engine = make_engine(settings.sqlalchemy_url)
    app.state.session_factory = async_sessionmaker(app.state.engine, expire_on_commit=False)
    app.state.match_tasks = MatchTaskManager()
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.exception_handler(BusinessError)
    async def business_error(_: Request, exc: BusinessError):
        return JSONResponse(
            Result.error(exc.code, exc.message).model_dump(by_alias=True), status_code=200
        )

    @app.exception_handler(RequestValidationError)
    async def validation_error(_: Request, exc: RequestValidationError):
        return JSONResponse(
            Result.error(400, exc.errors()[0]["msg"]).model_dump(by_alias=True), status_code=200
        )

    @app.exception_handler(Exception)
    async def internal_error(_: Request, exc: Exception):
        message = str(exc) if settings.debug else "服务器内部错误"
        return JSONResponse(Result.error(500, message).model_dump(by_alias=True), status_code=200)

    @app.get("/health")
    async def health():
        return Result.ok({"status": "UP"})

    app.include_router(router)
    app.include_router(match_router)

    @app.websocket("/ws/voice-interview/{session_id}")
    async def websocket_route(websocket: WebSocket, session_id: int):
        await voice_websocket(websocket, session_id)

    return app


app = create_app()
