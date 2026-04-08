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
    session_id: str | None = Field(default=None, description="Conversation session id")
    history: list[ChatMessage] = Field(default_factory=list, description="Chat history")
    system_prompt: str | None = Field(default=None, description="Optional system prompt")
    enable_rag: bool = Field(default=True, description="Enable GraphRAG context enhancement")
    temperature: float | None = Field(default=None, ge=0.0, le=2.0)
    max_tokens: int | None = Field(default=None, ge=1)


class AgentChatResponse(BaseModel):
    agent: AgentType
    content: str | None
    finish_reason: str
    usage: dict[str, int] = Field(default_factory=dict)
    metadata: dict[str, Any] = Field(default_factory=dict)


class ChatSessionResponse(BaseModel):
    id: str
    user_id: int
    title: str | None = None
    created_at: datetime | str
    updated_at: datetime | str
    last_message_at: datetime | str | None = None


class ChatMemoryResponse(BaseModel):
    id: int
    session_id: str
    role: str
    content: str
    created_at: datetime | str


class UserPublic(BaseModel):
    id: int
    username: str
    role: Literal["admin", "user"]
    created_at: datetime | str


class UserListResponse(BaseModel):
    items: list[UserPublic]
    page: int = 1
    page_size: int = 10
    total: int = 0


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


class UserLLMConfigRequest(BaseModel):
    provider: str = Field(..., min_length=1, max_length=32)
    model: str = Field(..., min_length=1, max_length=128)
    base_url: str = Field(..., min_length=1, max_length=256)
    api_key: str | None = Field(default=None, max_length=512)


class UserLLMConfigResponse(BaseModel):
    user_id: int
    provider: str
    model: str
    base_url: str
    api_key_set: bool
    created_at: datetime | str
    updated_at: datetime | str


class UserSkillConfigItem(BaseModel):
    user_id: int
    name: str
    path: str
    source: str
    description: str = ""
    enabled: bool
    created_at: datetime | str
    updated_at: datetime | str


class UserSkillUpdateItem(BaseModel):
    name: str = Field(..., min_length=1, max_length=128)
    enabled: bool = True


class UserSkillConfigUpdateRequest(BaseModel):
    skills: list[UserSkillUpdateItem] = Field(default_factory=list)


class SkillShopItem(BaseModel):
    external_id: str
    name: str
    source: str
    description: str = ""
    repo_url: str = ""
    skill_md_url: str = ""
    icon_url: str = ""
    tag: str = ""
    version: str = ""
    downloads: int = 0
    stars: int = 0
    available: bool = True
    missing_requirements: str = ""
    added: bool = False


class SkillShopListResponse(BaseModel):
    items: list[SkillShopItem] = Field(default_factory=list)
    page: int = 1
    page_size: int = 12
    has_more: bool = False
    total: int | None = None


class SkillShopAddRequest(BaseModel):
    external_id: str = Field(..., min_length=1, max_length=256)
    enabled: bool = True


AssetStatus = Literal["Normal", "Warning", "Critical"]


class DigitalAssetBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=128)
    type: str = Field(..., min_length=1, max_length=64)
    status: AssetStatus = "Normal"
    location: str = Field(..., min_length=1, max_length=128)
    health: int = Field(..., ge=0, le=100)
    model_file: str = Field(..., min_length=1, max_length=256)
    minio_object_key: str | None = Field(default=None, max_length=512)
    metadata: dict[str, Any] = Field(default_factory=dict)


class DigitalAssetCreateRequest(DigitalAssetBase):
    id: str = Field(..., min_length=1, max_length=64)


class DigitalAssetUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=128)
    type: str | None = Field(default=None, min_length=1, max_length=64)
    status: AssetStatus | None = None
    location: str | None = Field(default=None, min_length=1, max_length=128)
    health: int | None = Field(default=None, ge=0, le=100)
    model_file: str | None = Field(default=None, min_length=1, max_length=256)
    minio_object_key: str | None = Field(default=None, max_length=512)
    metadata: dict[str, Any] | None = None


class DigitalAssetResponse(DigitalAssetBase):
    id: str
    created_at: datetime | str
    updated_at: datetime | str


class DigitalAssetListResponse(BaseModel):
    items: list[DigitalAssetResponse]
    page: int = 1
    page_size: int = 10
    total: int = 0


class AssetRelationResponse(BaseModel):
    source_asset_id: str
    target_asset_id: str
    relation_type: str
    created_at: datetime | str


class AssetKnowledgeGraphNode(BaseModel):
    id: str
    name: str
    node_type: str
    labels: list[str] = Field(default_factory=list)
    properties: dict[str, Any] = Field(default_factory=dict)
    is_center: bool = False


class AssetKnowledgeGraphEdge(BaseModel):
    source: str
    target: str
    relation_type: str
    properties: dict[str, Any] = Field(default_factory=dict)


class AssetKnowledgeGraphResponse(BaseModel):
    asset_id: str
    asset_name: str
    summary: dict[str, int] = Field(default_factory=dict)
    nodes: list[AssetKnowledgeGraphNode] = Field(default_factory=list)
    edges: list[AssetKnowledgeGraphEdge] = Field(default_factory=list)


class SceneInstanceUpsertRequest(BaseModel):
    asset_id: str = Field(..., min_length=1, max_length=64)
    position_x: float = 0
    position_y: float = 0
    position_z: float = 0
    rotation_x: float = 0
    rotation_y: float = 0
    rotation_z: float = 0
    scale: float = Field(default=1, gt=0)


class SceneInstanceResponse(BaseModel):
    id: str
    scene_id: str
    asset_id: str
    position_x: float
    position_y: float
    position_z: float
    rotation_x: float
    rotation_y: float
    rotation_z: float
    scale: float
    name: str
    type: str
    status: AssetStatus
    location: str
    health: int
    model_file: str
    minio_object_key: str | None = None


class SceneRelationResponse(BaseModel):
    source_asset_id: str
    target_asset_id: str
    relation_type: str
    created_at: datetime | str | None = None


class SceneResponse(BaseModel):
    scene_id: str
    name: str
    description: str
    created_at: datetime | str
    updated_at: datetime | str
    asset_count: int
    instances: list[SceneInstanceResponse]
    relations: list[SceneRelationResponse]


class SceneBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=128)
    description: str = Field(default="", max_length=512)


class SceneCreateRequest(SceneBase):
    id: str = Field(..., min_length=1, max_length=64)


class SceneUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=128)
    description: str | None = Field(default=None, max_length=512)


class SceneSummaryResponse(SceneBase):
    id: str
    created_at: datetime | str
    updated_at: datetime | str
    asset_count: int


class SceneSummaryListResponse(BaseModel):
    items: list[SceneSummaryResponse]
    page: int = 1
    page_size: int = 10
    total: int = 0


class SceneAssetsReplaceRequest(BaseModel):
    asset_ids: list[str] = Field(default_factory=list)


class SceneRelationItem(BaseModel):
    source_asset_id: str = Field(..., min_length=1, max_length=64)
    target_asset_id: str = Field(..., min_length=1, max_length=64)
    relation_type: str = Field(default="upstream", min_length=1, max_length=64)


class SceneRelationsReplaceRequest(BaseModel):
    relations: list[SceneRelationItem] = Field(default_factory=list)


class AssetUploadResponse(BaseModel):
    object_key: str
    url: str
    file_size: int = Field(..., ge=0)
    content_type: str
    original_file_name: str


class ResourceItemResponse(BaseModel):
    id: str
    name: str
    original_file_name: str
    object_key: str
    url: str
    file_size: int = Field(..., ge=0)
    content_type: str
    created_at: datetime | str
    updated_at: datetime | str


class ResourceListResponse(BaseModel):
    items: list[ResourceItemResponse]
    page: int = 1
    page_size: int = 10
    total: int = 0


class ResourcePreviewUrlResponse(BaseModel):
    resource_id: str
    object_key: str
    preview_url: str
    expires_in_seconds: int = Field(..., ge=60)
