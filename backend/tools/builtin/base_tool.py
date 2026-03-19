from typing import Dict
# from tools.tool_executor import ToolExecutor


class Tool:
    def __init__(self,id:str,name:str,description:str,arguments:Dict,parameters:dict):
        self.id = id
        self.name = name
        self.description = description
        self.arguments = arguments
        self.parameters = parameters
    def execute(self,input:Dict)->str:
        pass

    def get_tools_description(self):
        return f"- {self.name}: {self.description}"

    def to_schema(self):
        """Convert tool to OpenAI function schema format."""
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.parameters,
            }
        }
