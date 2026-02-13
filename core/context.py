from typing import List,Optional
from .message import Message
from tools.builtin.base_tool import Tool
from .skill import SkillsLocader
from tools.tool_executor import ToolExecutor
from pathlib import Path
import re

class ContextBuilder():
    def __init__(self):
        self.skill_loader = SkillsLocader(Path("."))
        self.toolExecutor = ToolExecutor()

    def build_message(self,system_prompt:str) -> List[Message]:
        message_list = []
        system_prompt = self._get_enhanced_system_prompt(system_prompt)
        message_list.append(Message(role="system", content=system_prompt))
        return message_list

    def _get_enhanced_system_prompt(self,system_prompt:str) -> str:
        """
        获取增强后的系统提示词
        :return:
        """
        # 构建tool相关的提示词
        tools_str = "\n".join([tool.get_tools_description() for tool in self.toolExecutor.get_all_tools()])
        # 替换系统提示词中的工具占位符
        system_prompt = system_prompt.format(tools=tools_str)
        system_prompt += "\n" + " 当需要使用工具时，请使用以下格式："
        system_prompt += "\n" + "[TOOL_CALL: SearchTool:{'keyword':'北京天气'}]"
        # 构建skill相关的提示词
        skill_parts = []
        # 获取所有的skill的summary
        skills_summary = self.skill_loader.load_skill_summary()
        skill_parts.append(f"""# Skills
            The following skills extend your capabilities. To use a skill, read its SKILL.md file using the read_file tool.
            Skills with available="false" need dependencies installed first - you can try installing them with apt/brew.
            {skills_summary}""")
        system_prompt += "\n".join(skill_parts)
        return system_prompt


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

    def get_all_tools(self):
        return self.toolExecutor.get_all_tools()

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
