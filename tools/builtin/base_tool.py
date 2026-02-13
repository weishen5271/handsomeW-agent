from typing import Dict

class Tool:
    def __init__(self,id:str,name:str,description:str,arguments:Dict):
        self.id = id
        self.name = name
        self.description = description
        self.arguments = arguments
    def execute(self,input:Dict)->str:
        pass

    def get_tools_description(self):
        return f"- {self.name}: {self.description}"
