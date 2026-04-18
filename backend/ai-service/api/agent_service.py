import asyncio
import importlib
import logging
import os
import re
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


DEFAULT_SYSTEM_PROMPT = (
    "你是一个有能力调用外部工具的智能助手。\n"
    "可用工具如下:\n{tools}\n\n"
    "输出规范：\n"
    "1. 用户问候或闲聊时，直接用中文回复，不要调用工具。\n"
    "2. 需要外部信息或执行动作时才调用工具；已有足够信息就直接回答。\n"
    "3. 工具返回后，立即把结果整合成**完整、面向用户的中文最终答案**，不要只输出思考、计划或中间状态。\n"
    "4. 不要重复调用同一工具去拿相同信息；一旦信息足够，马上给出最终答案。\n"
    "5. 最终答案结构清晰、结论明确，让用户直接能读懂。"
)
logger = logging.getLogger(__name__)

# RAG 增强提示词模板，可通过环境变量 RAG_SYSTEM_PROMPT_TEMPLATE 覆盖
RAG_SYSTEM_PROMPT_TEMPLATE = os.environ.get(
    "RAG_SYSTEM_PROMPT_TEMPLATE",
    "{base_prompt}\n\n"
    "你正在处理工业设备/数字孪生相关问题。\n\n"
    "【GraphRAG 证据使用规则】\n"
    "1. 下方已经附带了从 Neo4j + Milvus 实时检索得到的证据，请**优先**基于这些证据回答。\n"
    "2. 如果证据已经能够支持回答用户问题，**必须直接组织成完整的中文最终答案返回给用户**，不要再调用任何工具，也不要只输出思考过程。\n"
    "3. 仅当证据明显不足、且确实需要其他工具（如执行脚本/读取文件）才能继续时，才调用工具；调用后拿到结果立刻整合成最终答案。\n"
    "4. 如果证据不足且没有合适工具，请明确告知用户不确定性与缺失项，不要编造。\n"
    "5. 最终答案要求：中文、结构清晰（必要时使用小标题或要点）、结论明确、可直接阅读。\n\n"
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

    def _should_enable_rag_for_query(self, user_input: str, enable_rag: bool) -> tuple[bool, str | None]:
        if not enable_rag:
            return False, "disabled_by_user"

        normalized = re.sub(r"\s+", " ", (user_input or "").strip().lower())
        if not normalized:
            return False, "empty_query"

        greeting_patterns = {
            "hi", "hello", "hey", "你好", "您好", "在吗", "在么", "早上好", "中午好", "晚上好",
            "嗨", "哈喽", "测试", "test",
        }
        smalltalk_tokens = {
            "谢谢", "感谢", "再见", "拜拜", "你是谁", "你能做什么", "介绍一下自己",
        }
        domain_keywords = {
            "设备", "产线", "传感器", "告警", "报警", "故障", "异常", "根因", "影响", "维护",
            "维修", "检修", "点检", "备件", "文档", "手册", "说明书", "健康", "状态", "参数",
            "温度", "压力", "振动", "电机", "泵", "阀", "轴承", "neo4j", "milvus", "graphrag",
        }

        if normalized in greeting_patterns:
            return False, "non_domain_smalltalk"
        if normalized in smalltalk_tokens:
            return False, "non_domain_smalltalk"
        if len(normalized) <= 12 and not any(keyword in normalized for keyword in domain_keywords):
            return False, "non_domain_smalltalk"
        return True, None

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

        queue: asyncio.Queue[dict[str, Any] | None] = asyncio.Queue()
        stream_flags = {
            "final_assistant_emitted": False,
            "done_emitted": False,
            "error_emitted": False,
        }
        loop = asyncio.get_running_loop()

        def push_event(item: dict[str, Any] | None) -> None:
            loop.call_soon_threadsafe(queue.put_nowait, item)

        def on_event(event: dict[str, Any]) -> None:
            event_type = event.get("type")
            data = event.get("data") or {}
            # Only a final (tool-less, stop) assistant event counts toward
            # stream completion.  Intermediate thinking must not satisfy the
            # "has final draft" contract.
            if event_type == "assistant" and data.get("is_final"):
                stream_flags["final_assistant_emitted"] = True
            if event_type == "done":
                if stream_flags["error_emitted"]:
                    return
                stream_flags["done_emitted"] = True
            if event_type == "error":
                if stream_flags["done_emitted"]:
                    return
                stream_flags["error_emitted"] = True
            push_event(event)

        async def runner() -> None:
            try:
                push_event(
                    {
                        "type": "session",
                        "data": {
                            "session_id": resolved_session_id,
                        },
                    }
                )

                effective_system_prompt, rag_meta = await self._build_prompt_with_rag_async(
                    user_input=user_input,
                    system_prompt=system_prompt,
                    enable_rag=enable_rag,
                    llm=llm,
                )
                push_event(
                    {
                        "type": "rag_context",
                        "data": rag_meta,
                    }
                )

                ReactAgent = _load_react_agent_class()
                react_agent = ReactAgent(
                    name=f"{agent_type.value}-react-runner",
                    llm=llm,
                    system_prompt=effective_system_prompt,
                    skill_loader=self._build_user_skill_loader(user_id),
                )
                self._prime_agent_context(react_agent=react_agent, history_messages=history_messages)
                result = await react_agent.run(
                    input_str=user_input,
                    verbose=False,
                    event_handler=on_event,
                )
                if result is None:
                    if not stream_flags["error_emitted"] and not stream_flags["done_emitted"]:
                        push_event(
                            {
                                "type": "error",
                                "data": {
                                    "message": "智能体未返回有效结果",
                                    "agent_type": agent_type.value,
                                },
                            }
                        )
                        stream_flags["error_emitted"] = True
                else:
                    final_content = (result.content or "").strip()
                    # Backstop: ReactAgent should already have emitted a final
                    # assistant + done, but guarantee the contract here.
                    if not final_content:
                        if not stream_flags["error_emitted"] and not stream_flags["done_emitted"]:
                            push_event(
                                {
                                    "type": "error",
                                    "data": {
                                        "message": "智能体返回了空内容",
                                        "agent_type": agent_type.value,
                                    },
                                }
                            )
                            stream_flags["error_emitted"] = True
                    else:
                        if not stream_flags["final_assistant_emitted"]:
                            push_event(
                                {
                                    "type": "assistant",
                                    "data": {
                                        "content": final_content,
                                        "finish_reason": result.finish_reason or "stop",
                                        "is_final": True,
                                    },
                                }
                            )
                            stream_flags["final_assistant_emitted"] = True
                        if not stream_flags["done_emitted"] and not stream_flags["error_emitted"]:
                            push_event(
                                {
                                    "type": "done",
                                    "data": {
                                        "content": final_content,
                                        "finish_reason": result.finish_reason or "stop",
                                        "usage": result.usage or {},
                                    },
                                }
                            )
                            stream_flags["done_emitted"] = True
            except Exception as exc:
                push_event(
                    {
                        "type": "error",
                        "data": {
                            "message": str(exc),
                            "agent_type": agent_type.value,
                        },
                    }
                )
            finally:
                push_event(None)

        task = asyncio.create_task(runner())
        latest_assistant_content = ""

        while True:
            item = await queue.get()
            if item is None:
                break

            event_type = item.get("type")
            data = item.get("data", {})
            # Persist only the final answer – intermediate thinking must not
            # be written back to chat history as the assistant turn.
            if event_type == "assistant" and data.get("is_final"):
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
        rag_enabled, disable_reason = self._should_enable_rag_for_query(user_input, enable_rag)
        if not rag_enabled:
            return base_prompt, {"enabled": False, "reason": disable_reason or "disabled_by_user"}

        try:
            # 延迟导入避免循环依赖
            try:
                from rag.graph_rag_bridge import GraphRAGBridge
            except ModuleNotFoundError:
                from backend.rag.graph_rag_bridge import GraphRAGBridge

            bridge = GraphRAGBridge(llm_client=llm)
            rag_result = bridge.build_context(user_input, llm_client=llm)
            rag_meta = dict(rag_result.metadata or {})
            if rag_meta.get("reason") in {"timeout", "runtime_error"}:
                logger.warning(
                    "GraphRAG retrieval failed (%s), falling back to base prompt: %s",
                    rag_meta["reason"],
                    rag_meta.get("error", ""),
                )
                rag_meta["rag_available"] = False
                return base_prompt, rag_meta

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
        except Exception:
            logger.exception("构建 GraphRAG Prompt 失败，降级为基础 Prompt")
            return base_prompt, {"enabled": False, "reason": "build_prompt_error", "rag_available": False}

    async def _build_prompt_with_rag_async(
        self,
        user_input: str,
        system_prompt: str | None,
        enable_rag: bool,
        llm: MyAgentsLLM,
    ) -> tuple[str, dict[str, Any]]:
        """Async version of _build_prompt_with_rag for non-blocking RAG retrieval."""
        base_prompt = system_prompt or DEFAULT_SYSTEM_PROMPT
        rag_enabled, disable_reason = self._should_enable_rag_for_query(user_input, enable_rag)
        if not rag_enabled:
            return base_prompt, {"enabled": False, "reason": disable_reason or "disabled_by_user"}

        try:
            # 延迟导入避免循环依赖
            try:
                from rag.graph_rag_bridge import GraphRAGBridge
            except ModuleNotFoundError:
                from backend.rag.graph_rag_bridge import GraphRAGBridge

            bridge = GraphRAGBridge(llm_client=llm)
            rag_result = await bridge.build_context_async(user_input, llm_client=llm)
            rag_meta = dict(rag_result.metadata or {})
            if rag_meta.get("reason") in {"timeout", "runtime_error"}:
                logger.warning(
                    "GraphRAG retrieval failed (%s), falling back to base prompt: %s",
                    rag_meta["reason"],
                    rag_meta.get("error", ""),
                )
                rag_meta["rag_available"] = False
                return base_prompt, rag_meta

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
        except Exception:
            logger.exception("构建 GraphRAG Prompt 失败，降级为基础 Prompt")
            return base_prompt, {"enabled": False, "reason": "build_prompt_error", "rag_available": False}

    def _compose_prompt_with_rag(self, base_prompt: str, rag_context: str) -> str:
        return RAG_SYSTEM_PROMPT_TEMPLATE.format(base_prompt=base_prompt, rag_context=rag_context)
