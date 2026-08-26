from __future__ import annotations

import asyncio
import base64
import io
import json
import logging
import threading
import time
import wave
from collections.abc import Awaitable, Callable
from typing import Any

import dashscope
from dashscope.audio.qwen_omni.omni_realtime import (
    AudioFormat,
    MultiModality,
    OmniRealtimeCallback,
    OmniRealtimeConversation,
    TranscriptionParams,
)
from dashscope.audio.qwen_tts_realtime.qwen_tts_realtime import (
    AudioFormat as TtsAudioFormat,
)
from dashscope.audio.qwen_tts_realtime.qwen_tts_realtime import (
    QwenTtsRealtime,
    QwenTtsRealtimeCallback,
)
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core import Settings
from app.integrations import OpenAIClient
from app.models import VoiceMessage, VoiceSession

logger = logging.getLogger(__name__)
_tts_api_key_lock = threading.Lock()

SendMessage = Callable[[dict[str, Any]], Awaitable[None]]


class _AsrCallback(OmniRealtimeCallback):
    def __init__(
        self,
        on_event: Callable[[str], None],
        on_close: Callable[[int | None, str | None], None],
    ):
        self._on_event = on_event
        self._on_close = on_close

    def on_event(self, message: str) -> None:
        self._on_event(message)

    def on_close(self, close_status_code, close_msg) -> None:
        self._on_close(close_status_code, close_msg)


class _TtsCallback(QwenTtsRealtimeCallback):
    def __init__(self, audio: bytearray, done: threading.Event, errors: list[str]):
        self.audio = audio
        self.done = done
        self.errors = errors

    def on_event(self, message: str) -> None:
        try:
            event = json.loads(message) if isinstance(message, str) else message
        except (TypeError, json.JSONDecodeError):
            return
        event_type = event.get("type")
        if event_type == "response.audio.delta":
            delta = event.get("delta")
            if delta:
                self.audio.extend(base64.b64decode(delta))
        elif event_type == "error":
            error = event.get("error", {})
            message = error.get("message", str(error)) if isinstance(error, dict) else str(error)
            self.errors.append(message)
            self.done.set()
        elif event_type == "response.done":
            self.done.set()

    def on_close(self, close_status_code, close_msg) -> None:
        self.done.set()


def pcm_to_wav(pcm: bytes, sample_rate: int = 24000) -> bytes:
    output = io.BytesIO()
    with wave.open(output, "wb") as writer:
        writer.setnchannels(1)
        writer.setsampwidth(2)
        writer.setframerate(sample_rate)
        writer.writeframes(pcm)
    return output.getvalue()


def synthesize_tts(settings: Settings, text: str) -> bytes:
    if not settings.ai_bailian_api_key or not text.strip():
        return b""
    audio = bytearray()
    done = threading.Event()
    errors: list[str] = []
    callback = _TtsCallback(audio, done, errors)
    with _tts_api_key_lock:
        previous_api_key = dashscope.api_key
        dashscope.api_key = settings.ai_bailian_api_key
        client = QwenTtsRealtime(model="qwen3-tts-flash-realtime", callback=callback)
        try:
            client.connect()
            client.update_session(
                voice="Cherry",
                response_format=TtsAudioFormat.PCM_24000HZ_MONO_16BIT,
                mode="commit",
                language_type="Chinese",
            )
            client.append_text(text)
            client.commit()
            if not done.wait(30):
                raise TimeoutError("TTS synthesis timeout")
            if errors:
                raise RuntimeError(errors[0])
            return pcm_to_wav(bytes(audio))
        finally:
            try:
                client.close()
            except Exception:
                logger.debug("failed to close TTS client", exc_info=True)
            dashscope.api_key = previous_api_key


class RealtimeAsr:
    def __init__(self, settings: Settings, loop: asyncio.AbstractEventLoop, send: SendMessage):
        self._settings = settings
        self._loop = loop
        self._send = send
        self._conversation: OmniRealtimeConversation | None = None
        self._thread: threading.Thread | None = None
        self._closed = threading.Event()
        self._connection_closed = threading.Event()
        self._configured = threading.Event()
        self._generation = 0
        self.ready = False

    async def start(self) -> bool:
        if not self._settings.ai_bailian_api_key:
            await self._send_error("AI Provider未配置API Key")
            return False
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()
        try:
            await asyncio.wait_for(self._wait_ready(), timeout=20)
        except TimeoutError:
            await self._send_error("实时语音识别连接超时，当前可使用文本提交")
            return False
        return self.ready

    async def _wait_ready(self) -> None:
        while not self._configured.is_set() and not self._closed.is_set():
            await asyncio.sleep(0.05)

    def _run(self) -> None:
        for attempt in range(3):
            if self._closed.is_set():
                return
            self._generation += 1
            generation = self._generation
            self._configured.clear()
            self._connection_closed.clear()
            try:
                callback = _AsrCallback(
                    lambda raw, current=generation: self._handle_event(raw, current),
                    lambda code, reason, current=generation: self._handle_close(
                        current, code, reason
                    ),
                )
                self._conversation = OmniRealtimeConversation(
                    model="qwen3-asr-flash-realtime",
                    api_key=self._settings.ai_bailian_api_key,
                    callback=callback,
                )
                self._conversation.connect()
                self._conversation.update_session(
                    output_modalities=[MultiModality.TEXT],
                    input_audio_format=AudioFormat.PCM_16000HZ_MONO_16BIT,
                    enable_input_audio_transcription=True,
                    input_audio_transcription_model="qwen3-asr-flash-realtime",
                    enable_turn_detection=True,
                    turn_detection_type="server_vad",
                    turn_detection_threshold=0.0,
                    turn_detection_silence_duration_ms=1000,
                    transcription_params=TranscriptionParams(
                        language="zh",
                        sample_rate=16000,
                        input_audio_format="pcm",
                    ),
                )
                self.ready = True
                self._configured.set()
                self._submit_threadsafe({"type": "control", "action": "asr_ready"})
                self._connection_closed.wait()
                if self._closed.is_set():
                    return
            except Exception as exc:
                logger.exception("realtime ASR connection failed")
                if attempt == 2:
                    self._submit_threadsafe(
                        {"type": "error", "message": f"实时语音识别启动失败: {exc}"}
                    )
                    return
            finally:
                self.ready = False
                if self._conversation:
                    try:
                        self._conversation.close()
                    except Exception:
                        logger.debug("failed to close ASR connection", exc_info=True)
            if not self._closed.is_set():
                self._submit_threadsafe(
                    {"type": "control", "action": "asr_reconnecting", "message": "正在重连语音识别"}
                )
                deadline = time.monotonic() + 1.0
                while not self._closed.is_set() and time.monotonic() < deadline:
                    time.sleep(0.05)

    def _handle_event(self, raw: str, generation: int) -> None:
        if generation != self._generation or self._closed.is_set():
            return
        try:
            event = json.loads(raw) if isinstance(raw, str) else raw
        except (TypeError, json.JSONDecodeError):
            logger.warning("ignoring malformed ASR event: %r", raw)
            return
        event_type = event.get("type")
        if event_type == "session.updated":
            self.ready = True
            self._configured.set()
            self._submit_threadsafe({"type": "control", "action": "asr_ready"})
        elif event_type in {
            "conversation.item.input_audio_transcription.delta",
            "input_audio_transcription.delta",
        }:
            self._submit_threadsafe(
                {"type": "subtitle", "text": event.get("delta", ""), "isFinal": False}
            )
        elif event_type in {
            "conversation.item.input_audio_transcription.completed",
            "input_audio_transcription.completed",
        }:
            self._submit_threadsafe(
                {"type": "subtitle", "text": event.get("transcript", ""), "isFinal": True}
            )
        elif event_type in {"error", "session.error"}:
            error = event.get("error", {})
            message = (
                error.get("message", "实时语音识别失败")
                if isinstance(error, dict)
                else str(error)
            )
            self._submit_threadsafe({"type": "error", "message": message})

    def _handle_close(self, generation: int, code: int | None, reason: str | None) -> None:
        if generation != self._generation or self._closed.is_set():
            return
        self.ready = False
        self._connection_closed.set()
        close_reason = f"语音识别连接已断开 (code={code}, reason={reason or '无'})"
        logger.warning("%s", close_reason)
        self._submit_threadsafe(
            {"type": "control", "action": "asr_reconnecting", "message": close_reason}
        )

    def append_audio(self, encoded: str) -> None:
        if not self.ready or not self._conversation:
            return
        try:
            self._conversation.append_audio(encoded)
        except Exception:
            logger.warning("ASR append_audio failed; reconnecting", exc_info=True)
            self.ready = False
            self._connection_closed.set()

    async def close(self) -> None:
        self._closed.set()
        self.ready = False
        if self._conversation:
            await asyncio.to_thread(self._conversation.close)

    def _submit_threadsafe(self, message: dict[str, Any]) -> None:
        if not self._loop.is_closed():
            asyncio.run_coroutine_threadsafe(self._send(message), self._loop)

    async def _send_error(self, message: str) -> None:
        await self._send({"type": "error", "message": message})


class VoicePipeline:
    def __init__(
        self,
        session_id: int,
        session_factory: async_sessionmaker[AsyncSession],
        settings: Settings,
        send: SendMessage,
    ):
        self.session_id = session_id
        self.session_factory = session_factory
        self.settings = settings
        self.send = send
        self.asr: RealtimeAsr | None = None
        self._sequence = 0
        self._ai_speaking = False
        self._ai_speak_cooldown_until = 0.0

    async def start(self) -> None:
        loop = asyncio.get_running_loop()
        self.asr = RealtimeAsr(self.settings, loop, self.send)
        await self.asr.start()
        session, history = await self._context()
        if session.intro_enabled and not history:
            opening = self._opening_question(session.skill_id)
            await self._save_message("AI", None, opening)
            await self.send({"type": "text", "content": opening, "final": True})
            audio = await asyncio.to_thread(synthesize_tts, self.settings, opening)
            if audio:
                await self.send(
                    {"type": "audio", "data": base64.b64encode(audio).decode(), "text": opening}
                )
                await self.send(
                    {"type": "control", "action": "audio_complete", "message": "面试官语音播放完成"}
                )

    async def audio(self, encoded: str) -> None:
        if self.asr and not self._ai_speaking and time.monotonic() >= self._ai_speak_cooldown_until:
            await asyncio.to_thread(self.asr.append_audio, encoded)

    async def submit(self, text: str) -> None:
        text = text.strip()
        if not text:
            return
        await self._save_message("USER", text, None)
        session, history = await self._context()
        messages = [
            {
                "role": "system",
                "content": (
                    "你是专业、简洁的中文技术面试官。根据候选人的回答继续追问，"
                    "一次只问一个问题，不要输出编号、Markdown或冗余客套话。"
                    f"岗位技能方向：{session.skill_id}，难度：{session.difficulty}。"
                ),
            },
            *history,
            {"role": "user", "content": text},
        ]
        client = OpenAIClient(
            self.settings.ai_base_url,
            self.settings.ai_bailian_api_key,
            self.settings.ai_model,
        )
        answer_parts: list[str] = []
        try:
            async for chunk in client.stream_text(messages):
                answer_parts.append(chunk)
                await self.send({"type": "text", "content": chunk, "final": False})
        except Exception:
            logger.exception("LLM streaming failed for voice session %s", self.session_id)
            await self.send({"type": "error", "message": "生成下一道问题失败，请稍后重试"})
            return
        answer = "".join(answer_parts).strip()
        if answer:
            await self._save_message("AI", None, answer)
        await self.send({"type": "text", "content": answer, "final": True})
        self._ai_speaking = True
        try:
            try:
                audio = await asyncio.to_thread(synthesize_tts, self.settings, answer)
            except Exception as exc:
                logger.warning("TTS failed for session %s: %s", self.session_id, exc)
                audio = b""
            if audio:
                await self.send(
                    {"type": "audio", "data": base64.b64encode(audio).decode(), "text": answer}
                )
                await self.send(
                    {"type": "control", "action": "audio_complete", "message": "面试官语音播放完成"}
                )
        finally:
            self._ai_speaking = False
            self._ai_speak_cooldown_until = time.monotonic() + 0.8

    async def close(self) -> None:
        if self.asr:
            await self.asr.close()

    async def _context(self) -> tuple[VoiceSession, list[dict[str, str]]]:
        async with self.session_factory() as db:
            session = await db.get(VoiceSession, self.session_id)
            if session is None:
                raise ValueError("语音面试会话不存在")
            rows = (
                await db.scalars(
                    select(VoiceMessage)
                    .where(VoiceMessage.session_id == self.session_id)
                    .order_by(VoiceMessage.sequence_num, VoiceMessage.id)
                )
            ).all()
            history = []
            for row in rows:
                if row.user_recognized_text:
                    history.append({"role": "user", "content": row.user_recognized_text})
                if row.ai_generated_text:
                    history.append({"role": "assistant", "content": row.ai_generated_text})
            return session, history[-20:]

    @staticmethod
    def _opening_question(skill_id: str) -> str:
        questions = {
            "java-backend": (
                "你好，我是本场面试官。第一个问题：请用 1 分钟介绍一个你深度参与的后端项目，"
                "按业务目标、核心链路、你的职责回答，说完我会追问一个关键技术决策。"
            ),
            "python-backend": (
                "你好，我是本场面试官。第一个问题：请介绍一个你用 Python 深度参与的后端项目，"
                "按业务场景、技术选型理由、你负责的核心模块回答。"
            ),
            "algorithm": (
                "你好，我是本场面试官。第一个问题：请你口述一道算法题，"
                "只讲问题建模、数据结构选型、步骤、复杂度和边界处理。"
            ),
            "bytedance-backend": (
                "你好，我是本场面试官。我们先做一道算法与数据结构热身题："
                "请从哈希表、堆、栈、队列、树、图里选两个，结合一道熟悉的题口述建模思路。"
            ),
        }
        return questions.get(skill_id, questions["java-backend"])

    async def _save_message(
        self, message_type: str, user_text: str | None, ai_text: str | None
    ) -> None:
        async with self.session_factory() as db:
            self._sequence += 1
            db.add(
                VoiceMessage(
                    session_id=self.session_id,
                    message_type=message_type,
                    phase="INTRO",
                    user_recognized_text=user_text,
                    ai_generated_text=ai_text,
                    sequence_num=self._sequence,
                )
            )
            await db.commit()