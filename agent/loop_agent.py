from agent.base_agent import BaseAgent
from typing import Optional

from tools.tool_executor import ToolExecutor
from core import MyAgentsLLM
from core.message import Message
from tools.builtin.file_tool import ReadFileTool, WriteFileTool
from core.skill import SkillsLocader
from pathlib import Path
from core.prompt import BASE_PROMPT_TEMPLATE
from dotenv import load_dotenv
from core.context import ContextBuilder
import asyncio



"""
    循环agent，用于重复执行直到满足条件
"""

class LoopAgent(BaseAgent):
    def __init__(self,name:str,llm: MyAgentsLLM,system_prompt:str):
        self.name = name
        self.llm = llm
        self.system_prompt = system_prompt
        self._running_status = True
        self.skill_loader = SkillsLocader(Path("."))
        self.context = ContextBuilder()


    def _register_default_tools(self):
        # 注册文件工具
        self.context.add_tools(ReadFileTool())
        self.context.add_tools(WriteFileTool())




    async def run(self,input:str) -> Optional[str]:
        """
        循环执行直到满足条件
        :param input:
        :return:
        """
        # while self._running_status:
        #  获取提示词
        message_list = self.context.build_message(BASE_PROMPT_TEMPLATE)
        # 调用LLM
        message_list.append(Message(role="user", content=input))
        # message_list.append(Message(role="tool",content=tool_output))
        llm_response = await self.llm.invoke(message_list,tools=self.context.get_all_tools())

        print(llm_response)

        # 解析LLM的输出
        # 这里简单地假设LLM的输出是一个字符串，直接返回
        return llm_response
    def _parse_tool_calls(self,output:str) -> list:
        pass
    def _execute_tool(self,tool_list:list) -> Optional[str]:
        pass



if __name__ == '__main__':
    # 测试循环agent
    load_dotenv()
    agent = LoopAgent("agent", MyAgentsLLM(), BASE_PROMPT_TEMPLATE)
    response = asyncio.run(agent.run("今天北京的天气怎么样"))
    print(response)