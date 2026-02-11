from core import Agent


class ToolExecutor():

    def __init__(self):
        self._tools_list = []

    def register_tool(self, tool):
        self._tools_list.append(tool)