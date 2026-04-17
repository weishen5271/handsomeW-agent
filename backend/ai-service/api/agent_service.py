import asyncio
import importlib
import logging
import os
import sys
from pathlib import Path
from typing import Any, AsyncIterator

from core.message import Message
from core.llm import MyAgentsLLM
from core.skill import SkillsLocader

from api.schemas import AgentType, ChatMessage
from api.user_store import (
    append_chat_memory,
    create_chat_session,
    get_chat_session,
    get_user_llm_config,
    list_user_skills,
    list_chat_memories,
)


DEFAULT_SYSTEM_PROMPT = "You are a helpful ReAct assistant."
logger = logging.getLogger(__name__)

# RAG 增强提示词模板，可通过环境变量 RAG_SYSTEM_PROMPT_TEMPLATE 覆盖
RAG_SYSTEM_PROMPT_TEMPLATE = os.environ.get(
    "RAG_SYSTEM_PROMPT_TEMPLATE",
    "{base_prompt}\n\n"
    "你正在处理工业设备/数字孪生相关问题。\n"
    "回答时请优先依据下方 GraphRAG 检索证据；如果证据不足，请明确说明不确定性，不要编造。\n"
    "若用户问题涉及设备状态、故障诊断、影响分析、维护记录、备件或文档位置，请先使用这些证据再决定是否补充工具调用。\n\n"
    "## GraphRAG 检索上下文\n"
    "{rag_context}"
)


def _load_react_agent_class():
    agent_dir = Path(__file__).resolve().parent.parent / "agent"
    agent_dir_str = str(agent_dir)
    if agent_dir_str not in sys.path:
        sys.path.insert(0, agent_dir_str)

    module = importlib.import_module("react_agent")
    return getattr(module, "ReactAgent")


class AgentService:
    def __init__(self) -> None:
        pass

    def _build_llm(self, user_id: int) -> MyAgentsLLM:
        config = get_user_llm_config(user_id)
        llm_kwargs: dict[str, Any] = {}
        if config:
            llm_kwargs = {
                "provider": config["provider"],
                "model": config["model"],
                "base_url": config["base_url"],
                "api_key": config.get("api_key"),
            }
        return MyAgentsLLM(**llm_kwargs)

    def _build_user_skill_loader(self, user_id: int) -> SkillsLocader:
        skill_rows = list_user_skills(user_id=user_id)
        enabled_names = [item["name"] for item in skill_rows if item.get("enabled")]
        return SkillsLocader(skills=skill_rows, allowed_skill_names=enabled_names or [])

    def _resolve_session_id(self, user_id: int, session_id: str | None) -> str:
        if session_id:
            existing = get_chat_session(user_id=user_id, session_id=session_id)
            if existing is not None:
                return session_id
        created = create_chat_session(user_id=user_id)
        return str(created["id"])

    def _load_history(
        self,
        user_id: int,
        session_id: str,
        fallback_history: list[ChatMessage] | None,
    ) -> list[ChatMessage]:
        stored = list_chat_memories(user_id=user_id, session_id=session_id, limit=500)
        if stored:
            return [ChatMessage(role=item["role"], content=item["content"]) for item in stored]
        return fallback_history or []

    def _prime_agent_context(self, react_agent: Any, history_messages: list[ChatMessage]) -> None:
        valid_roles = {"system", "user", "assistant", "tool"}
        for one in history_messages:
            if one.role not in valid_roles:
                continue
            react_agent.context.add_message(Message(role=one.role, content=one.content))

    def _persist_chat_turn(
        self,
        user_id: int,
        session_id: str,
        user_input: str,
        assistant_output: str | None,
    ) -> None:
        append_chat_memory(
            user_id=user_id,
            session_id=session_id,
            role="user",
            content=user_input,
        )
        if assistant_output:
            append_chat_memory(
                user_id=user_id,
                session_id=session_id,
                role="assistant",
                content=assistant_output,
            )

    async def run(
        self,
        user_id: int,
        agent_type: AgentType,
        user_input: str,
        session_id: str | None = None,
        history: list[ChatMessage] | None = None,
        system_prompt: str | None = None,
        enable_rag: bool = True,
        temperature: float | None = None,
        max_tokens: int | None = None,
    ) -> dict[str, Any]:
        _ = temperature
        _ = max_tokens
        llm = self._build_llm(user_id)
        resolved_session_id = self._resolve_session_id(user_id=user_id, session_id=session_id)
        history_messages = self._load_history(
            user_id=user_id,
            session_id=resolved_session_id,
            fallback_history=history,
        )

        effective_system_prompt, rag_meta = await self._build_prompt_with_rag_async(
            user_input=user_input,
            system_prompt=system_prompt,
            enable_rag=enable_rag,
            llm=llm,
        )

        ReactAgent = _load_react_agent_class()
        react_agent = ReactAgent(
            name=f"{agent_type.value}-react-runner",
            llm=llm,
            system_prompt=effective_system_prompt,
            skill_loader=self._build_user_skill_loader(user_id),
        )
        self._prime_agent_context(react_agent=react_agent, history_messages=history_messages)
        result = await react_agent.run(input_str=user_input, verbose=False)

        if result is None:
            self._persist_chat_turn(
                user_id=user_id,
                session_id=resolved_session_id,
                user_input=user_input,
                assistant_output=None,
            )
            return {
                "content": None,
                "finish_reason": "error",
                "usage": {},
                "metadata": {
                    "runner": "react_agent.run",
                    "agent_type": agent_type.value,
                    "session_id": resolved_session_id,
                    "rag": rag_meta,
                },
            }

        self._persist_chat_turn(
            user_id=user_id,
            session_id=resolved_session_id,
            user_input=user_input,
            assistant_output=result.content,
        )

        return {
            "content": result.content,
            "finish_reason": result.finish_reason,
            "usage": result.usage,
            "metadata": {
                "runner": "react_agent.run",
                "agent_type": agent_type.value,
                "session_id": resolved_session_id,
                "rag": rag_meta,
            },
        }

    async def run_stream(
        self,
        user_id: int,
        agent_type: AgentType,
        user_input: str,
        session_id: str | None = None,
        history: list[ChatMessage] | None = None,
        system_prompt: str | None = None,
        enable_rag: bool = True,
        temperature: float | None = None,
        max_tokens: int | None = None,
    ) -> AsyncIterator[dict[str, Any]]:
        _ = temperature
        _ = max_tokens
        llm = self._build_llm(user_id)
        resolved_session_id = self._resolve_session_id(user_id=user_id, session_id=session_id)
        history_messages = self._load_history(
            user_id=user_id,
            session_id=resolved_session_id,
            fallback_history=history,
        )

        effective_system_prompt, rag_meta = await self._build_prompt_with_rag_async(
            user_input=user_input,
            system_prompt=system_prompt,
            enable_rag=enable_rag,
            llm=llm,
        )

        ReactAgent = _load_react_agent_class()
        react_agent = ReactAgent(
            name=f"{agent_type.value}-react-runner",
            llm=llm,
            system_prompt=effective_system_prompt,
            skill_loader=self._build_user_skill_loader(user_id),
        )
        self._prime_agent_context(react_agent=react_agent, history_messages=history_messages)

        queue: asyncio.Queue[dict[str, Any] | None] = asyncio.Queue()

        def on_event(event: dict[str, Any]) -> None:
            queue.put_nowait(event)

        async def runner() -> None:
            try:
                queue.put_nowait(
                    {
                        "type": "session",
                        "data": {
                            "session_id": resolved_session_id,
                        },
                    }
                )
                queue.put_nowait(
                    {
                        "type": "rag_context",
                        "data": rag_meta,
                    }
                )
                result = await react_agent.run(
                    input_str=user_input,
                    verbose=False,
                    event_handler=on_event,
                )
                if result is None:
                    queue.put_nowait(
                        {
                            "type": "error",
                            "data": {
                                "message": "react_agent returned no result",
                                "agent_type": agent_type.value,
                            },
                        }
                    )
            except Exception as exc:
                queue.put_nowait(
                    {
                        "type": "error",
                        "data": {
                            "message": str(exc),
                            "agent_type": agent_type.value,
                        },
                    }
                )
            finally:
                queue.put_nowait(None)

        task = asyncio.create_task(runner())
        latest_assistant_content = ""

        while True:
            item = await queue.get()
            if item is None:
                break

            event_type = item.get("type")
            data = item.get("data", {})
            if event_type == "assistant":
                text = str(data.get("content", ""))
                if text:
                    latest_assistant_content = text
            if event_type == "done":
                text = str(data.get("content", ""))
                if text:
                    latest_assistant_content = text
            yield item

        await task

        self._persist_chat_turn(
            user_id=user_id,
            session_id=resolved_session_id,
            user_input=user_input,
            assistant_output=latest_assistant_content,
        )

    def _build_prompt_with_rag(
        self,
        user_input: str,
        system_prompt: str | None,
        enable_rag: bool,
        llm: MyAgentsLLM,
    ) -> tuple[str, dict[str, Any]]:
        base_prompt = system_prompt or DEFAULT_SYSTEM_PROMPT
        if not enable_rag:
            return base_prompt, {"enabled": False, "reason": "disabled_by_user"}

        try:
            # 延迟导入避免循环依赖
            try:
                from rag.graph_rag_bridge import GraphRAGBridge
            except ModuleNotFoundError:
                from backend.rag.graph_rag_bridge import GraphRAGBridge

            bridge = GraphRAGBridge(llm_client=llm)
            if not bridge.is_ready:
                return base_prompt, {"enabled": False, "reason": "graph_rag_not_ready", "rag_available": False}

            rag_result = bridge.build_context(user_input, llm_client=llm)
            rag_meta = dict(rag_result.metadata or {})

            if not rag_meta.get("enabled"):
                rag_meta.setdefault("reason", "retrieval_disabled")
                rag_meta["rag_available"] = False
                return base_prompt, rag_meta

            context_text = (rag_result.context_text or "").strip()
            if not context_text:
                rag_meta.update({
                    "enabled": False,
                    "reason": "empty_rag_context",
                    "rag_available": False,
                })
                return base_prompt, rag_meta

            effective_prompt = self._compose_prompt_with_rag(
                base_prompt=base_prompt,
                rag_context=context_text,
            )
            rag_meta.update({
                "enabled": True,
                "context_attached": True,
                "context_chars": len(context_text),
                "rag_available": True,
            })
            return effective_prompt, rag_meta
        except Exception as exc:
            logger.exception("构建 GraphRAG Prompt 失败")
            error_prompt = (
                f"{base_prompt}\n\n"
                "[注意: 知识检索系统暂时不可用，请基于自身能力回答，如有需要可明确说明无法获取实时信息。]"
            )
            return error_prompt, {
                "enabled": False,
                "reason": "prompt_build_error",
                "error": f"{type(exc).__name__}: {exc}",
                "rag_available": False,
            }

    async def _build_prompt_with_rag_async(
        self,
        user_input: str,
        system_prompt: str | None,
        enable_rag: bool,
        llm: MyAgentsLLM,
    ) -> tuple[str, dict[str, Any]]:
        """Async version of _build_prompt_with_rag for non-blocking RAG retrieval."""
        base_prompt = system_prompt or DEFAULT_SYSTEM_PROMPT
        if not enable_rag:
            return base_prompt, {"enabled": False, "reason": "disabled_by_user"}

        try:
            # 延迟导入避免循环依赖
            try:
                from rag.graph_rag_bridge import GraphRAGBridge
            except ModuleNotFoundError:
                from backend.rag.graph_rag_bridge import GraphRAGBridge

            bridge = GraphRAGBridge(llm_client=llm)
            if not bridge.is_ready:
                return base_prompt, {"enabled": False, "reason": "graph_rag_not_ready", "rag_available": False}

            rag_result = await bridge.build_context_async(user_input, llm_client=llm)
            rag_meta = dict(rag_result.metadata or {})

            if not rag_meta.get("enabled"):
                rag_meta.setdefault("reason", "retrieval_disabled")
                rag_meta["rag_available"] = False
                return base_prompt, rag_meta

            context_text = (rag_result.context_text or "").strip()
            if not context_text:
                rag_meta.update({
                    "enabled": False,
                    "reason": "empty_rag_context",
                    "rag_available": False,
                })
                return base_prompt, rag_meta

            effective_prompt = self._compose_prompt_with_rag(
                base_prompt=base_prompt,
                rag_context=context_text,
            )
            rag_meta.update({
                "enabled": True,
                "context_attached": True,
                "context_chars": len(context_text),
                "rag_available": True,
            })
            return effective_prompt, rag_meta
        except Exception as exc:
            logger.exception("构建 GraphRAG Prompt 失败")
            error_prompt = (
                f"{base_prompt}\n\n"
                "[注意: 知识检索系统暂时不可用，请基于自身能力回答，如有需要可明确说明无法获取实时信息。]"
            )
            return error_prompt, {
                "enabled": False,
                "reason": "prompt_build_error",
                "error": f"{type(exc).__name__}: {exc}",
                "rag_available": False,
            }

    def _compose_prompt_with_rag(self, base_prompt: str, rag_context: str) -> str:
        return RAG_SYSTEM_PROMPT_TEMPLATE.format(base_prompt=base_prompt, rag_context=rag_context)
