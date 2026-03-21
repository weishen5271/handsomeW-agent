import asyncio
import importlib
import sys
from pathlib import Path
from typing import Any, AsyncIterator

from core.llm import MyAgentsLLM

from api.schemas import AgentType, ChatMessage
from api.user_store import get_user_llm_config


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

    async def run(
        self,
        user_id: int,
        agent_type: AgentType,
        user_input: str,
        history: list[ChatMessage] | None = None,
        system_prompt: str | None = None,
        temperature: float | None = None,
        max_tokens: int | None = None,
    ) -> dict[str, Any]:
        _ = history
        _ = temperature
        _ = max_tokens
        llm = self._build_llm(user_id)

        ReactAgent = _load_react_agent_class()
        react_agent = ReactAgent(
            name=f"{agent_type.value}-react-runner",
            llm=llm,
            system_prompt=system_prompt or DEFAULT_SYSTEM_PROMPT,
        )
        result = await react_agent.run(input_str=user_input, verbose=False)

        if result is None:
            return {
                "content": None,
                "finish_reason": "error",
                "usage": {},
                "metadata": {
                    "runner": "react_agent.run",
                    "agent_type": agent_type.value,
                },
            }

        return {
            "content": result.content,
            "finish_reason": result.finish_reason,
            "usage": result.usage,
            "metadata": {
                "runner": "react_agent.run",
                "agent_type": agent_type.value,
            },
        }

    async def run_stream(
        self,
        user_id: int,
        agent_type: AgentType,
        user_input: str,
        history: list[ChatMessage] | None = None,
        system_prompt: str | None = None,
        temperature: float | None = None,
        max_tokens: int | None = None,
    ) -> AsyncIterator[dict[str, Any]]:
        _ = history
        _ = temperature
        _ = max_tokens
        llm = self._build_llm(user_id)

        ReactAgent = _load_react_agent_class()
        react_agent = ReactAgent(
            name=f"{agent_type.value}-react-runner",
            llm=llm,
            system_prompt=system_prompt or DEFAULT_SYSTEM_PROMPT,
        )

        queue: asyncio.Queue[dict[str, Any] | None] = asyncio.Queue()

        def on_event(event: dict[str, Any]) -> None:
            queue.put_nowait(event)

        async def runner() -> None:
            try:
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

        while True:
            item = await queue.get()
            if item is None:
                break
            yield item

        await task
