from dotenv import load_dotenv
from typing import Optional, Tuple
from pathlib import Path
import json
import re

from base_agent import BaseAgent
from core.llm import MyAgentsLLM
from core.prompt import BASE_PROMPT_TEMPLATE, REACT_PROMPT_TEMPLATE
from core.message import Message
from core.context import ContextBuilder
from core.skill import SkillsLocader
from core.base import LLMResponse
from tools.builtin.file_tool import ReadFileTool, WriteFileTool
from tools.builtin.search_tool import SearchTool


class ReactAgent(BaseAgent):
    def __init__(self, name: str, llm: MyAgentsLLM, system_prompt: str):
        super().__init__()
        self.name = name
        self.llm = llm
        self.system_prompt = system_prompt
        self._running_status = True
        self.skill_loader = SkillsLocader(Path("."))
        self.context = ContextBuilder()
        self._register_default_tools()

    async def run(self, input_str: str, max_iterations: int = 5, verbose: bool = True) -> Optional[LLMResponse]:
        """
        运行ReAct智能体来回答一个问题。
        """
        green = "\033[92m"
        yellow = "\033[93m"
        if verbose:
            print(f"{green} 开始处理问题: {input_str}")

        # 用户输入只写入一次历史，避免每轮重复
        self.context.add_message(Message(role="user", content=input_str))

        for iteration in range(max_iterations):
            if verbose:
                print(f"{green} 第{iteration + 1}轮迭代")

            message_list = self.context.build_message(BASE_PROMPT_TEMPLATE)
            llm_response = await self.llm.invoke(
                message_list,
                tools=self.context.get_tool_definitions(),
            )
            if llm_response is None:
                return None

            if verbose:
                print(f"{yellow} LLM回复: {llm_response.content}")

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

            if llm_response.tool_calls:
                tool_response = self.context.execute_tool(llm_response.tool_calls)
                for one in tool_response:
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
                        print(f"{green} 执行工具: {one}")

            if llm_response.finish_reason == "stop":
                self._running_status = False
                if verbose:
                    print(f"{green} 迭代结束，完成原因: {llm_response.finish_reason}")
                return llm_response

        return llm_response

    def _register_default_tools(self):
        self.context.add_tools(ReadFileTool())
        self.context.add_tools(WriteFileTool())
        self.context.add_tools(SearchTool())

    def _parse_output(self, text: str) -> Tuple[Optional[str], Optional[str]]:
        """解析LLM输出，提取思考和行动"""
        thought_match = re.search(r"Thought: (.*)", text)
        action_match = re.search(r"Action: (.*)", text)

        thought = thought_match.group(1).strip() if thought_match else None
        action = action_match.group(1).strip() if action_match else None

        return thought, action

    def _parse_action(self, action_text: str) -> Tuple[Optional[str], Optional[str]]:
        """解析行动文本，提取工具名称和输入"""
        match = re.match(r"(\w+)\[(.*)\]", action_text)
        if match:
            return match.group(1), match.group(2)
        return None, None


if __name__ == '__main__':
    load_dotenv(verbose=True)
    agent = ReactAgent(name="ReAct", llm=MyAgentsLLM(), system_prompt="")
    message_list = agent.context.build_message(REACT_PROMPT_TEMPLATE)
    print(message_list)
