from abc import ABC,abstractmethod
from typing import Optional
from core.llm import MyAgentsLLM
from core.base import LLMResponse,ToolCallRequest


class BaseAgent(ABC):
    def __init__(self):
        pass

    @abstractmethod
    def run(self,input_str:str) -> Optional[LLMResponse]:
        pass

    def _get_enhanced_system_prompt(self) -> str:
        """
        获取增强后的系统提示词
        :return:
        """
        pass
