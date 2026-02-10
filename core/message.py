from importlib.metadata import metadata

from pydantic import BaseModel
from typing import Optional,Dict,Literal,Any
from datetime import datetime

MessageRole = Literal["user","assistant","system","tool"]
class Message(BaseModel):
    """
    消息类
    """
    content: str
    role: Literal["user","assistant","system","tool"]
    timestamp:datetime = None
    metadata:Optional[Dict[str,Any]]=None
    def __init__(self,content:str,role:MessageRole,**kwargs):
        super().__init__(
            content=content,
            role=role,
            timestamp = kwargs.get("timestamp",datetime.now()),
            metadata = kwargs.get("metadata", {})
        )

    def to_dict(self)->Dict[str,Any]:
        """
        转换为字典格式
        """
        return {
            "content":self.content,
            "role":self.role,
        }

    def __str__(self):
        return f"{self.content} ({self.role})"