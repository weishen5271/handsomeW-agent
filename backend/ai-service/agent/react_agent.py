from dotenv import load_dotenv
from typing import Callable, Optional, Tuple
import json
import re
import time

from base_agent import BaseAgent
from core.base import LLMResponse
from core.context import ContextBuilder
from core.llm import MyAgentsLLM
from core.message import Message
from core.prompt import BASE_PROMPT_TEMPLATE, REACT_PROMPT_TEMPLATE
from core.skill import SkillsLocader
from tools.builtin.file_tool import ReadFileTool, WriteFileTool
from tools.builtin.search_tool import SearchTool
from tools.builtin.shell_tool import ShellExecTool
from tools.builtin.skill_tool import GetSkillTool, ListSkillsTool


class ReactAgent(BaseAgent):
    def __init__(
        self,
        name: str,
        llm: MyAgentsLLM,
        system_prompt: str,
        skill_loader: SkillsLocader | None = None,
    ):
        super().__init__()
        self.name = name
        self.llm = llm
        self.system_prompt = system_prompt
        self._running_status = True
        self.skill_loader = skill_loader or SkillsLocader()
        self.context = ContextBuilder(skill_loader=self.skill_loader)
        self._register_default_tools()

    def _emit_event(
        self,
        event_handler: Optional[Callable[[dict], None]],
        event_type: str,
        data: dict,
    ) -> None:
        if event_handler is None:
            return
        try:
            event_handler({"type": event_type, "data": data})
        except Exception:
            # Do not let stream callback failures break the main agent flow.
            return

    async def _synthesize_final_answer(self) -> Optional[LLMResponse]:
        """Ask the model for a direct final answer when the loop ended without visible text."""
        message_list = self.context.build_message(
            (self.system_prompt or BASE_PROMPT_TEMPLATE)
            + "\n\n请基于已有上下文和工具结果，直接给用户最终答案。不要再调用工具。"
        )
        return await self.llm.invoke(
            message_list,
            tools=None,
        )

    async def run(
        self,
        input_str: str,
        max_iterations: int = 5,
        verbose: bool = True,
        event_handler: Optional[Callable[[dict], None]] = None,
    ) -> Optional[LLMResponse]:
        green = "\033[92m"
        yellow = "\033[93m"

        if verbose:
            print(f"{green} starting react run: {input_str}")
        self._emit_event(event_handler, "start", {"input": input_str})

        self.context.add_message(Message(role="user", content=input_str))

        llm_response: Optional[LLMResponse] = None
        # Accumulate token usage across iterations
        total_usage: dict[str, int] = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
        for iteration in range(max_iterations):
            if verbose:
                print(f"{green} iteration {iteration + 1}")
            self._emit_event(
                event_handler,
                "iteration_start",
                {"iteration": iteration + 1, "max_iterations": max_iterations},
            )

            message_list = self.context.build_message(self.system_prompt or BASE_PROMPT_TEMPLATE)
            llm_response = await self.llm.invoke(
                message_list,
                tools=self.context.get_tool_definitions(),
            )
            if llm_response is None:
                self._emit_event(event_handler, "error", {"message": "模型未返回结果"})
                return None

            # Accumulate usage from this iteration
            if llm_response.usage:
                for key in total_usage:
                    total_usage[key] += llm_response.usage.get(key, 0)

            if verbose:
                print(f"{yellow} llm response: {llm_response.content}")

            self._emit_event(
                event_handler,
                "assistant",
                {
                    "content": llm_response.content or "",
                    "finish_reason": llm_response.finish_reason or "",
                },
            )

            assistant_metadata = {}
            if llm_response.tool_calls:
                assistant_metadata = {
                    "tool_calls": [
                        {
                            "id": tc.id,
                            "type": "function",
                            "function": {
                                "name": tc.name,
                                "arguments": json.dumps(tc.arguments, ensure_ascii=False)
                                if not isinstance(tc.arguments, str)
                                else tc.arguments,
                            },
                        }
                        for tc in llm_response.tool_calls
                    ]
                }

            self.context.add_message(
                Message(
                    role="assistant",
                    content=llm_response.content or "",
                    metadata=assistant_metadata,
                )
            )

            has_tool_calls = bool(llm_response.tool_calls)
            if has_tool_calls:
                self._emit_event(
                    event_handler,
                    "tool_call",
                    {
                        "iteration": iteration + 1,
                        "tool_calls": [
                            {"id": tc.id, "name": tc.name, "arguments": tc.arguments}
                            for tc in llm_response.tool_calls
                        ],
                    },
                )

                tool_start_time = time.monotonic()
                tool_response = self.context.execute_tool(llm_response.tool_calls)
                for one in tool_response:
                    tool_duration_ms = int((time.monotonic() - tool_start_time) * 1000)
                    self.context.add_message(
                        Message(
                            role="tool",
                            content=one["content"],
                            metadata={
                                "tool_name": one.get("tool_name"),
                                "tool_call_id": one.get("tool_call_id"),
                                "is_error": one.get("is_error", False),
                            },
                        )
                    )
                    if verbose:
                        print(f"{green} tool response: {one}")

                    self._emit_event(
                        event_handler,
                        "tool_result",
                        {
                            "iteration": iteration + 1,
                            "tool_name": one.get("tool_name"),
                            "tool_call_id": one.get("tool_call_id"),
                            "content": one.get("content", ""),
                            "is_error": one.get("is_error", False),
                            "duration_ms": tool_duration_ms,
                        },
                    )

            # Some OpenAI-compatible providers return `finish_reason == "stop"`
            # together with tool calls. In that case we should continue the loop
            # so the model can consume the tool results and produce a final answer.
            if has_tool_calls:
                continue

            if llm_response.finish_reason == "stop":
                content_text = (llm_response.content or "").strip()
                if not content_text:
                    # Model returned stop with empty content (common with some
                    # Chinese LLMs when tools are present).  Retry once without
                    # tools so the model can answer directly.
                    if verbose:
                        print(f"{yellow} empty content on stop – retrying without tools")
                    synthesized = await self._synthesize_final_answer()
                    if synthesized and (synthesized.content or "").strip():
                        content_text = synthesized.content.strip()
                        llm_response = synthesized
                        if synthesized.usage:
                            for key in total_usage:
                                total_usage[key] += synthesized.usage.get(key, 0)
                    else:
                        self._emit_event(
                            event_handler,
                            "error",
                            {"message": "模型已结束，但未返回任何正文内容"},
                        )
                        raise RuntimeError("模型已结束，但未返回任何正文内容")

                self._running_status = False
                if verbose:
                    print(f"{green} react run done: {llm_response.finish_reason}")

                self._emit_event(
                    event_handler,
                    "done",
                    {
                        "content": content_text,
                        "finish_reason": llm_response.finish_reason or "stop",
                        "usage": total_usage,
                    },
                )
                return llm_response

        final_response = llm_response
        if final_response is None or not (final_response.content or "").strip():
            synthesized = await self._synthesize_final_answer()
            if synthesized is not None and (synthesized.content or "").strip():
                final_response = synthesized

        if final_response is None or not (final_response.content or "").strip():
            self._emit_event(
                event_handler,
                "error",
                {"message": "智能体执行结束，但未生成任何可展示内容"},
            )
            raise RuntimeError("智能体执行结束，但未生成任何可展示内容")

        self._emit_event(
            event_handler,
            "done",
            {
                "content": final_response.content if final_response else "",
                "finish_reason": final_response.finish_reason if final_response else "length",
                "usage": total_usage,
            },
        )
        return final_response

    def _register_default_tools(self):
        self.context.add_tools(ReadFileTool())
        self.context.add_tools(WriteFileTool())
        self.context.add_tools(SearchTool())
        self.context.add_tools(ListSkillsTool(loader=self.skill_loader))
        self.context.add_tools(GetSkillTool(loader=self.skill_loader))
        self.context.add_tools(ShellExecTool())

    def _parse_output(self, text: str) -> Tuple[Optional[str], Optional[str]]:
        thought_match = re.search(r"Thought: (.*)", text)
        action_match = re.search(r"Action: (.*)", text)

        thought = thought_match.group(1).strip() if thought_match else None
        action = action_match.group(1).strip() if action_match else None

        return thought, action

    def _parse_action(self, action_text: str) -> Tuple[Optional[str], Optional[str]]:
        match = re.match(r"(\w+)\[(.*)\]", action_text)
        if match:
            return match.group(1), match.group(2)
        return None, None


if __name__ == "__main__":
    load_dotenv(verbose=True)
    agent = ReactAgent(name="ReAct", llm=MyAgentsLLM(), system_prompt="")
    message_list = agent.context.build_message(REACT_PROMPT_TEMPLATE)
    print(message_list)
