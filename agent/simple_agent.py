from typing import Optional
from core.llm import MyAgentsLLM
from core.prompt import BASE_PROMPT_TEMPLATE
from tools.builtin.search_tool import SearchTool
from core.message import Message
from tools.builtin.base_tool import Tool
import re
'''
    基础agent
'''
class SimpleAgent:
    def __init__(self,name:str,llm: MyAgentsLLM,system_prompt: str):
        self.name = name
        self.llm = llm
        self.system_prompt = system_prompt
        self._tools:list[Tool] = []

    def run(self,input:str) -> Optional[str]:

        #  获取提示词
        system_prompt = self._get_enhanced_system_prompt()
        # 调用LLM
        message_list = []
        message_list.append(Message(role="system",content=system_prompt))
        message_list.append(Message(role="user",content=input))
        # message_list.append(Message(role="tool",content=tool_output))
        response = self.llm.invoke(message_list)

        # tool_output = self._execute_tool(input)

        # 解析LLM的输出
        # 这里简单地假设LLM的输出是一个字符串，直接返回
        return response

    def _execute_tool(self,input:str) -> Optional[str]:
        output_list = []
        # 查找对应的工具
        for tool in self._tools:
            try:
                output_list.append(tool.execute(input))
            except Exception as e:
                return f"工具执行错误: {str(e)}"
        # 合并工具输出
        return "\n".join(output_list)

    def _parse_tool_output(self,output:str) -> Optional[str]:
        # 解析工具输出
        # 这里简单地假设工具输出是一个字符串，直接返回
        return output


    def add_tools(self,tools:list):
        self._tools.extend(tools)

    def _parse_tool_calls(self, text: str) -> list:
        """解析文本中的工具调用"""
        pattern = r'\[TOOL_CALL:([^:]+):([^\]]+)\]'
        matches = re.findall(pattern, text)

        tool_calls = []
        for tool_name, parameters in matches:
            tool_calls.append({
                'tool_name': tool_name.strip(),
                'parameters': parameters.strip(),
                'original': f'[TOOL_CALL:{tool_name}:{parameters}]'
            })

        return tool_calls
    def _get_enhanced_system_prompt(self):
        # 格式化系统提示词
        system_prompt = self.system_prompt
        # 获取当前agent 可用的工具列表
        tools_str = "\n".join([tool.get_tools_description() for tool in self._tools])
        # 替换系统提示词中的工具占位符
        system_prompt = system_prompt.format(tools=tools_str)
        system_prompt += "\n"+" 当需要使用工具时，请使用以下格式："
        system_prompt += "\n" + "[TOOL_CALL: SearchTool:{'keyword':'北京天气'}]"
        return system_prompt




if __name__ == '__main__':
     from dotenv import load_dotenv
     load_dotenv()
     agent = SimpleAgent("SimpleAgent",MyAgentsLLM(),BASE_PROMPT_TEMPLATE)
     agent.add_tools([SearchTool()])
     print(agent.run("今天北京的天气怎么样"))
