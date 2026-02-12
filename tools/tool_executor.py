from tools.builtin.base_tool import Tool

class ToolExecutor():

    def __init__(self):
        self._tools_list:list[Tool] = []

    def register_tool(self, tool):
        self._tools_list.append(tool)

    def _to_dict(self):
        tool_dict = {}
        for tool in self._tools_list:
            tool_dict[tool.name] = tool
        return tool_dict
    def get_tool(self,tool_name:str):
        return self._to_dict().get(tool_name,None)

    def get_all_tools(self):
        return self._tools_list
