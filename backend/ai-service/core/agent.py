"""
Agent基类
"""
from abc import ABC, abstractmethod # 抽象基类
from typing import Optional,Dict,Any
from .config import Config
from .llm import MyAgentsLLM
from .message import Message


class Agent(ABC):

    def __init__(
        self,
        name: str,
        llm: MyAgentsLLM,
        system_prompt: str,
        config:Optional[Config]):

        self.name = name
        self.llm = llm
        self.system_prompt = system_prompt
        self.config = config
        self._history = list[Message] = []

    def run(self,input_text:str):
        pass

    def  add_message(self,message:Message):
        """增加消息到历史记录"""
        self._history.append(message)

    def clear_history(self):
        """清空历史记录"""
        self._history = []

    def get_history(self) -> list[Message]:
        """获取历史记录"""
        return self._history.copy()

    def  __str__(self):
        return f"Agent(name={self.name}, provider={self.llm.provider})"

    def __repr__(self):
        return self.__str__()
