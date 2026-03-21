from datetime import datetime
from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, Field


class AgentType(str, Enum):
    simple = "simple"
    react = "react"
    loop = "loop"


class ChatMessage(BaseModel):
    role: str = Field(..., description="Message role: system/user/assistant/tool")
    content: str = Field(..., description="Message content")


class AgentChatRequest(BaseModel):
    input: str = Field(..., min_length=1, description="User input")
    history: list[ChatMessage] = Field(default_factory=list, description="Chat history")
    system_prompt: str | None = Field(default=None, description="Optional system prompt")
    temperature: float | None = Field(default=None, ge=0.0, le=2.0)
    max_tokens: int | None = Field(default=None, ge=1)


class AgentChatResponse(BaseModel):
    agent: AgentType
    content: str | None
    finish_reason: str
    usage: dict[str, int] = Field(default_factory=dict)
    metadata: dict[str, Any] = Field(default_factory=dict)


class UserPublic(BaseModel):
    id: int
    username: str
    role: Literal["admin", "user"]
    created_at: datetime | str


class UserRegisterRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=32)
    password: str = Field(..., min_length=6, max_length=128)


class UserLoginRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=32)
    password: str = Field(..., min_length=6, max_length=128)


class AuthResponse(BaseModel):
    token: str
    user: UserPublic


class UserCreateRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=32)
    password: str = Field(..., min_length=6, max_length=128)
    role: Literal["admin", "user"] = "user"


class UserUpdateRequest(BaseModel):
    username: str | None = Field(default=None, min_length=3, max_length=32)
    password: str | None = Field(default=None, min_length=6, max_length=128)
    role: Literal["admin", "user"] | None = None
