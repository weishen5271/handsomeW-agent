from core import Agent
from core.llm import MyAgentsLLM

class ReactAgent:
    def __init__(self,llm: MyAgentsLLM):
        self.llm = llm

    def execute(self):
        """
          运行ReAct智能体来回答一个问题。
        """

