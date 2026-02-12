from typing import Optional
from core.llm import MyAgentsLLM
from core.prompt import BASE_PROMPT_TEMPLATE
from tools.builtin.search_tool import SearchTool
from core.message import Message
from tools.builtin.base_tool import Tool
import re

from tools.tool_executor import ToolExecutor

'''
    基础agent
'''
class SimpleAgent:
    def __init__(self,name:str,llm: MyAgentsLLM,system_prompt: str):
        self.name = name
        self.llm = llm
        self.system_prompt = system_prompt
        self.toolExecutor = ToolExecutor()

    def run(self,input:str) -> Optional[str]:

        #  获取提示词
        system_prompt = self._get_enhanced_system_prompt()
        # 调用LLM
        message_list = []
        message_list.append(Message(role="system",content=system_prompt))
        message_list.append(Message(role="user",content=input))
        # message_list.append(Message(role="tool",content=tool_output))
        llm_response = self.llm.invoke(message_list)
        tool_list = self._parse_tool_calls(llm_response['content'])
        tool_output = self._execute_tool(tool_list)
        if tool_output is not None:
            message_list.append(Message(role="assistant",content=tool_output))
            message_list.append(Message(role="user",content=tool_output))
        llm_response = self.llm.invoke(message_list)
        # 解析LLM的输出
        # 这里简单地假设LLM的输出是一个字符串，直接返回
        return llm_response

    def _execute_tool(self,tool_list:list) -> Optional[str]:
        response = None
        # 查找对应的工具
        for tool in tool_list:
            try:
                tool_obj = self.toolExecutor.get_tool(tool['tool_name'])
                if tool_obj:
                    # 解析参数为字典
                    params_dict = eval(tool['parameters'])
                    response = tool_obj.execute(params_dict)
                else:
                    return f"工具 {tool['name']} 不存在"
            except Exception as e:
                return f"工具执行错误: {str(e)}"
        return response

    def _parse_tool_output(self,output:str) -> Optional[str]:
        # 解析工具输出
        # 这里简单地假设工具输出是一个字符串，直接返回
        return output


    def add_tools(self,tools:Tool):
        self.toolExecutor.register_tool(tools)

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
        tools_str = "\n".join([tool.get_tools_description() for tool in self.toolExecutor.get_all_tools()])
        # 替换系统提示词中的工具占位符
        system_prompt = system_prompt.format(tools=tools_str)
        system_prompt += "\n"+" 当需要使用工具时，请使用以下格式："
        system_prompt += "\n" + "[TOOL_CALL: SearchTool:{'keyword':'北京天气'}]"
        return system_prompt




if __name__ == '__main__':
     from dotenv import load_dotenv
     load_dotenv()
     agent = SimpleAgent("SimpleAgent",MyAgentsLLM(),BASE_PROMPT_TEMPLATE)
     agent.add_tools(SearchTool())
     print(agent.run("今天北京的天气怎么样"))
