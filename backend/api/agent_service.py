import asyncio
import importlib
import sys
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

        effective_system_prompt, rag_meta = self._build_prompt_with_rag(
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

        effective_system_prompt, rag_meta = self._build_prompt_with_rag(
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
        _ = user_input
        _ = enable_rag
        _ = llm
        base_prompt = system_prompt or DEFAULT_SYSTEM_PROMPT
        rag_meta = {
            "enabled": False,
            "reason": "temporarily_disabled_in_agent_service",
        }
        return base_prompt, rag_meta
