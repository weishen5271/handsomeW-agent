from typing import Dict

class Tool:
    def __init__(self,name:str,description:str):
        self.name = name
        self.description = description

    def execute(self,input:Dict)->str:
        pass

    def get_tools_description(self):
        return f"- {self.name}: {self.description}"
