from typing import List,Optional
from .message import Message
from tools.builtin.base_tool import Tool
from .skill import SkillsLocader
from tools.tool_executor import ToolExecutor
from pathlib import Path
import platform
import re
import json
import ast
from utils import find_project_root
from core.base import ToolCallRequest

class ContextBuilder():
    BOOTSTRAP_FILES = ["AGENTS.md", "SOUL.md", "USER.md", "TOOLS.md", "IDENTITY.md"]
    def __init__(self):
        self.skill_loader = SkillsLocader(Path("."))
        self.toolExecutor = ToolExecutor()
        current_dir = Path.cwd()
        self.workspace = find_project_root(start_dir = current_dir) / "workspace"
        self.history_message = []

    def build_message(self,system_prompt:str) -> List[Message]:
        message_list = []
        system_prompt = self._get_enhanced_system_prompt(system_prompt)
        print("生成的系统提示词" + system_prompt)
        message_list.append(Message(role="system", content=system_prompt))
        if self.history_message:
            message_list.extend(self.history_message)
        return message_list

    def _get_enhanced_system_prompt(self,system_prompt:str) -> str:
        """
        获取增强后的系统提示词
        :return:
        """
        # 构建tool相关的提示词
        # tools_str = "\n".join([tool.get_tools_description() for tool in self.toolExecutor.get_all_tools()])
        # # 替换系统提示词中的工具占位符
        # system_prompt = system_prompt.format(tools=tools_str)
        # system_prompt += "\n" + " 当需要使用工具时，请使用以下格式："
        # system_prompt += "\n" + "[TOOL_CALL: SearchTool:{'keyword':'北京天气'}]"
        # # 构建skill相关的提示词
        # skill_parts = []
        # # 获取所有的skill的summary
        # skills_summary = self.skill_loader.load_skill_summary()
        # skill_parts.append(f"""# Skills
        #     The following skills extend your capabilities. To use a skill, read its SKILL.md file using the read_file tool.
        #     Skills with available="false" need dependencies installed first - you can try installing them with apt/brew.
        #     {skills_summary}""")
        # system_prompt += "\n".join(skill_parts)

        parts = []

        # Core identity
        if system_prompt is None:
            parts.append(self._get_identity())
        else:
            tools_str = "\n".join([tool.get_tools_description() for tool in self.toolExecutor.get_all_tools()])
            # 替换系统提示词中的工具占位符
            system_prompt = system_prompt.format(tools=tools_str)
            parts.append(system_prompt)
        # Bootstrap files
        bootstrap = self._load_bootstrap_files()
        if bootstrap:
            parts.append(bootstrap)

        # 2. Available skills: only show summary (agent uses read_file to load)
        skills_summary = self.skill_loader.load_skill_summary()
        if skills_summary:
            parts.append(f"""# Skills
            The following skills extend your capabilities.
            Preferred flow:
            1) call list_skills
            2) call get_skill with skill_name
            You may still use read_file when needed.
            When SKILL.md includes terminal commands, execute them with exec_shell (do not just paraphrase).
            Skills with available="false" need dependencies installed first - you can try installing them with apt/brew.
            {skills_summary}""")

        return "\n\n---\n\n".join(parts)

    def execute_tool(self, tool_list: list) -> list[dict]:
        """
        支持 ToolCallRequest 和 dict 两种输入，返回结构化结果列表。
        """
        results = []

        for tool_call in tool_list:
            tool_name = None
            tool_call_id = None
            arguments = {}

            # 1) 标准对象：ToolCallRequest
            if isinstance(tool_call, ToolCallRequest):
                tool_name = tool_call.name
                tool_call_id = tool_call.id
                arguments = tool_call.arguments or {}

            # 2) 兼容 dict（老格式）
            elif isinstance(tool_call, dict):
                tool_name = tool_call.get("tool_name") or tool_call.get("name")
                tool_call_id = tool_call.get("id")
                raw_args = (
                        tool_call.get("arguments")
                        or tool_call.get("parameters")
                        or {}
                )
                if isinstance(raw_args, str):
                    try:
                        arguments = json.loads(raw_args)
                    except json.JSONDecodeError:
                        arguments = {"raw": raw_args}
                elif isinstance(raw_args, dict):
                    arguments = raw_args
                else:
                    arguments = {}

            else:
                results.append({
                    "tool_name": "unknown",
                    "tool_call_id": None,
                    "content": f"不支持的 tool_call 类型: {type(tool_call)}",
                    "is_error": True,
                })
                continue

            tool_obj = self.toolExecutor.get_tool(tool_name)
            if not tool_obj:
                results.append({
                    "tool_name": tool_name,
                    "tool_call_id": tool_call_id,
                    "content": f"工具不存在: {tool_name}",
                    "is_error": True,
                })
                continue

            try:
                output = tool_obj.execute(arguments)
                results.append({
                    "tool_name": tool_name,
                    "tool_call_id": tool_call_id,
                    "content": str(output),
                    "is_error": False,
                })
            except Exception as e:
                results.append({
                    "tool_name": tool_name,
                    "tool_call_id": tool_call_id,
                    "content": f"工具执行错误: {str(e)}",
                    "is_error": True,
                })

        return results

    def _parse_tool_output(self,output:str) -> Optional[str]:
        # 解析工具输出
        # 这里简单地假设工具输出是一个字符串，直接返回
        return output


    def add_tools(self,tools:Tool):
        self.toolExecutor.register_tool(tools)

    def get_all_tools(self):
        return self.toolExecutor.get_all_tools()

    def get_tool_definitions(self):
        return self.toolExecutor.get_definitions()

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

    def _get_identity(self) -> str:
        """Get the core identity section."""
        from datetime import datetime
        import time as _time
        now = datetime.now().strftime("%Y-%m-%d %H:%M (%A)")
        tz = _time.strftime("%Z") or "UTC"
        workspace_path = str(self.workspace.expanduser().resolve())
        system = platform.system()
        runtime = f"{'macOS' if system == 'Darwin' else system} {platform.machine()}, Python {platform.python_version()}"

        return f"""# nanobot 🐈
            You are nanobot, a helpful AI assistant. You have access to tools that allow you to:
            - Read, write, and edit files
            - Execute shell commands
            - Search the web and fetch web pages
            - Send messages to users on chat channels
            - Spawn subagents for complex background tasks
            
            ## Current Time
            {now} ({tz})
            
            ## Runtime
            {runtime}
            
            ## Workspace
            Your workspace is at: {workspace_path}
            - Memory files: {workspace_path}/memory/MEMORY.md
            - Daily notes: {workspace_path}/memory/YYYY-MM-DD.md
            - Custom skills: {workspace_path}/skills/{{skill-name}}/SKILL.md
            
            IMPORTANT: When responding to direct questions or conversations, reply directly with your text response.
            Only use the 'message' tool when you need to send a message to a specific chat channel (like WhatsApp).
            For normal conversation, just respond with text - do not call the message tool.
            
            Always be helpful, accurate, and concise. When using tools, think step by step: what you know, what you need, and why you chose this tool.
            When remembering something, write to {workspace_path}/memory/MEMORY.md"""

    def _load_bootstrap_files(self) -> str:
        """Load all bootstrap files from workspace."""
        parts = []

        for filename in self.BOOTSTRAP_FILES:
            file_path = self.workspace / filename
            if file_path.exists():
                content = file_path.read_text(encoding="utf-8")
                parts.append(f"## {filename}\n\n{content}")

        return "\n\n".join(parts) if parts else ""

    def add_message(self,message:Message):
        self.history_message.append(message)

