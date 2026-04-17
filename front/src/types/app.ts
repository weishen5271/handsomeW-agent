export type ChatRole = "user" | "assistant";

export type ViewMode =
  | "dashboard"
  | "chat"
  | "assets"
  | "resources"
  | "scenes"
  | "scene3d"
  | "alarms"
  | "status"
  | "users"
  | "llm";

export type AuthMode = "login" | "register";
export type UserRole = "admin" | "user";

export type ChatMessage = {
  id: string;
  memoryId?: number;
  role: ChatRole;
  text: string;
  imageUrl?: string;
  pinned?: boolean;
  timestamp: string;
};

export type StreamState = {
  loading: boolean;
  label: "正在思考" | "正在合成图像" | null;
};

export type ThinkingStepStatus = "running" | "done" | "error";

export type ThinkingStep = {
  id: string;
  type: "iteration" | "tool_call" | "tool_result";
  status: ThinkingStepStatus;
  iteration: number;
  toolName?: string;
  toolCallId?: string;
  arguments?: Record<string, unknown>;
  content?: string;
  isError?: boolean;
  durationMs?: number;
  timestamp: number;
};

export type StreamEvent = {
  eventType: string;
  payload: Record<string, unknown>;
};

export type AuthUser = {
  id: number;
  username: string;
  role: UserRole;
  created_at: string;
};

export type AuthResponse = {
  token: string;
  user: AuthUser;
};

export type AgentSession = {
  id: string;
  user_id: number;
  title: string | null;
  created_at: string;
  updated_at: string;
  last_message_at: string | null;
};

export type AgentMemory = {
  id: number;
  session_id: string;
  role: string;
  content: string;
  pinned: boolean;
  created_at: string;
};

export type TokenUsage = {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
};

export type ContextDoc = {
  id: number;
  session_id: string;
  file_name: string;
  char_count: number;
  created_at: string;
};

export type UserLLMConfig = {
  user_id: number;
  provider: string;
  model: string;
  base_url: string;
  api_key_set: boolean;
  created_at: string;
  updated_at: string;
};

export type UserListResponse = {
  items: AuthUser[];
  page: number;
  page_size: number;
  total: number;
};

export type UserSkillConfig = {
  user_id: number;
  name: string;
  path: string;
  source: string;
  description: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type SkillShopItem = {
  external_id: string;
  name: string;
  source: string;
  description: string;
  repo_url: string;
  skill_md_url: string;
  icon_url: string;
  tag: string;
  version: string;
  downloads: number;
  stars: number;
  available: boolean;
  missing_requirements: string;
  added: boolean;
};

export type SkillShopListResponse = {
  items: SkillShopItem[];
  page: number;
  page_size: number;
  has_more: boolean;
  total: number | null;
};
