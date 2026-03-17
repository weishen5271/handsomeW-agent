from pydantic import BaseModel
from typing import Optional, Dict, Literal, Any
from datetime import datetime

MessageRole = Literal["user", "assistant", "system", "tool"]


class Message(BaseModel):
    """
    消息类
    """

    content: str
    role: Literal["user", "assistant", "system", "tool"]
    timestamp: datetime = None
    metadata: Optional[Dict[str, Any]] = None

    def __init__(self, content: str, role: MessageRole, **kwargs):
        super().__init__(
            content=content,
            role=role,
            timestamp=kwargs.get("timestamp", datetime.now()),
            metadata=kwargs.get("metadata", {}),
        )

    def to_dict(self) -> Dict[str, Any]:
        """
        转换为字典格式
        """
        message: Dict[str, Any] = {
            "content": self.content,
            "role": self.role,
        }
        metadata = self.metadata or {}

        if self.role == "tool":
            tool_call_id = metadata.get("tool_call_id")
            tool_name = metadata.get("tool_name")
            if tool_call_id:
                message["tool_call_id"] = tool_call_id
            if tool_name:
                message["name"] = tool_name

        if self.role == "assistant" and metadata.get("tool_calls"):
            message["tool_calls"] = metadata.get("tool_calls")

        return message

    def __str__(self):
        return f"{self.content} ({self.role})"
