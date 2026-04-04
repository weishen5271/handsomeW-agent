import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Activity,
  ChevronDown,
  Download,
  Bot,
  Database,
  Image,
  LayoutDashboard,
  Loader2,
  Package,
  LogOut,
  MessageSquare,
  Plus,
  Send,
  Settings,
  Shield,
  ShieldAlert,
  ShoppingBag,
  Sparkles,
  Star,
  Trash2,
  User,
  UserPlus,
  X,
} from "lucide-react";
import AlarmsPanel from "./components/AlarmsPanel";
import DashboardPanel from "./components/DashboardPanel";
import DigitalAssetsPanel from "./components/DigitalAssetsPanel";
import type { DigitalAsset } from "./components/DigitalAssetsPanel";
import SceneConfigPanel from "./components/SceneConfigPanel";
import Scene3DPanel from "./components/Scene3DPanel";
import SystemStatusPanel from "./components/SystemStatusPanel";
import PaginationControls from "./components/PaginationControls";

type ChatRole = "user" | "assistant";
type ViewMode = "dashboard" | "chat" | "assets" | "scenes" | "scene3d" | "alarms" | "status" | "users" | "llm";
type AuthMode = "login" | "register";
type UserRole = "admin" | "user";

type ChatMessage = {
  id: string;
  role: ChatRole;
  text: string;
  imageUrl?: string;
  timestamp: string;
};

type StreamState = {
  loading: boolean;
  label: "正在思考" | "正在合成图像" | null;
};

type StreamEvent = {
  eventType: string;
  payload: Record<string, unknown>;
};

type AuthUser = {
  id: number;
  username: string;
  role: UserRole;
  created_at: string;
};

type AuthResponse = {
  token: string;
  user: AuthUser;
};

type AgentSession = {
  id: string;
  user_id: number;
  title: string | null;
  created_at: string;
  updated_at: string;
  last_message_at: string | null;
};

type AgentMemory = {
  id: number;
  session_id: string;
  role: string;
  content: string;
  created_at: string;
};

type UserLLMConfig = {
  user_id: number;
  provider: string;
  model: string;
  base_url: string;
  api_key_set: boolean;
  created_at: string;
  updated_at: string;
};

type UserListResponse = {
  items: AuthUser[];
  page: number;
  page_size: number;
  total: number;
};

type UserSkillConfig = {
  user_id: number;
  name: string;
  path: string;
  source: string;
  description: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

type SkillShopItem = {
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

type SkillShopListResponse = {
  items: SkillShopItem[];
  page: number;
  page_size: number;
  has_more: boolean;
  total: number | null;
};

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000").replace(/\/+$/, "");
const AGENT_API = `${API_BASE_URL}/agents/react/chat/stream`;
const TOKEN_KEY = "lumina_auth_token";
const SKILL_SHOP_PAGE_SIZE = 12;
const SKILL_SHOP_ACCENT_CLASSES = [
  "bg-blue-50 text-blue-600 border-blue-200",
  "bg-emerald-50 text-emerald-600 border-emerald-200",
  "bg-violet-50 text-violet-600 border-violet-200",
  "bg-amber-50 text-amber-600 border-amber-200",
  "bg-cyan-50 text-cyan-600 border-cyan-200",
  "bg-rose-50 text-rose-600 border-rose-200",
];

function nowTag() {
  return new Date().toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatCompactCount(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0";
  if (value >= 10000) return `${(value / 10000).toFixed(1).replace(/\.0$/, "")}万`;
  if (value >= 1000) return `${(value / 1000).toFixed(1).replace(/\.0$/, "")}千`;
  return String(Math.floor(value));
}

function skillAccentClass(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) % SKILL_SHOP_ACCENT_CLASSES.length;
  }
  return SKILL_SHOP_ACCENT_CLASSES[Math.abs(hash) % SKILL_SHOP_ACCENT_CLASSES.length];
}

function parseBlocks(chunk: string): StreamEvent[] {
  const blocks = chunk.split("\n\n").filter(Boolean);
  return blocks.map((block) => {
    const lines = block.split("\n");
    let eventType = "message";
    const dataLines: string[] = [];

    for (const line of lines) {
      if (line.startsWith("event:")) eventType = line.replace("event:", "").trim();
      if (line.startsWith("data:")) dataLines.push(line.replace("data:", "").trim());
    }

    let payload: Record<string, unknown> = {};
    const rawData = dataLines.join("\n");
    if (rawData) {
      try {
        payload = JSON.parse(rawData) as Record<string, unknown>;
      } catch {
        payload = { raw: rawData };
      }
    }

    return { eventType, payload };
  });
}

function extractImageUrl(text: string): string | undefined {
  const markdownMatch = text.match(/!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/i);
  if (markdownMatch?.[1]) return markdownMatch[1];

  const directMatch = text.match(/https?:\/\/\S+\.(?:png|jpg|jpeg|gif|webp)/i);
  if (directMatch?.[0]) return directMatch[0];

  return undefined;
}

function cleanText(text: string, imageUrl?: string): string {
  if (!imageUrl) return text.trim();
  const escapedUrl = imageUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text
    .replace(new RegExp(`!\\[[^\\]]*\\]\\(${escapedUrl}\\)`, "g"), "")
    .replace(imageUrl, "")
    .trim();
}

function parseErrorDetail(detail: unknown): string {
  if (!detail) return "请求失败";
  if (typeof detail === "string") return translateErrorText(detail);
  if (Array.isArray(detail)) {
    const joined = detail.map((item) => parseErrorDetail(item)).filter(Boolean).join("；");
    return joined || "请求失败";
  }
  if (typeof detail === "object") {
    const record = detail as Record<string, unknown>;
    const msg = typeof record.msg === "string" ? translateErrorText(record.msg) : "";
    const loc = Array.isArray(record.loc) ? formatErrorLoc(record.loc) : "";
    if (msg && loc) return `${loc}: ${msg}`;
    if (msg) return msg;
    return translateErrorText(JSON.stringify(record));
  }
  return translateErrorText(String(detail));
}

function formatErrorLoc(loc: unknown[]): string {
  const raw = loc.join(".");
  const locMap: Record<string, string> = {
    "body.username": "用户名",
    "body.password": "密码",
    "body.role": "角色",
    "body.provider": "Provider",
    "body.model": "模型",
    "body.base_url": "Base URL",
    "body.api_key": "API Key",
    "query.input": "输入参数",
  };
  return locMap[raw] ?? raw;
}

function translateErrorText(text: string): string {
  const normalized = text.trim();
  if (!normalized) return "请求失败";

  const exactMap: Record<string, string> = {
    "Field required": "必填项缺失",
    "Input should be a valid string": "请输入有效的文本",
    "Input should be a valid integer": "请输入有效的整数",
    "Input should be a valid number": "请输入有效的数字",
    "String should have at least 3 characters": "长度至少为 3 个字符",
    "String should have at least 6 characters": "长度至少为 6 个字符",
    "String should have at most 32 characters": "长度不能超过 32 个字符",
    "String should have at most 128 characters": "长度不能超过 128 个字符",
    "Invalid username or password": "用户名或密码错误",
    "Username already exists": "用户名已存在",
    "Invalid or expired token": "登录状态无效或已过期",
    "Missing authorization header": "缺少认证请求头",
    "Invalid authorization format": "认证格式无效",
    "Missing bearer token": "缺少访问令牌",
    "Admin access required": "需要管理员权限",
    "User not found": "用户不存在",
  };

  if (exactMap[normalized]) return exactMap[normalized];

  if (normalized.includes("String should have at least")) {
    return normalized.replace("String should have at least", "长度至少为").replace("characters", "个字符");
  }
  if (normalized.includes("String should have at most")) {
    return normalized.replace("String should have at most", "长度不能超过").replace("characters", "个字符");
  }

  return normalized;
}

export default function App() {
  const [token, setToken] = useState<string>(() => localStorage.getItem(TOKEN_KEY) ?? "");
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [bootLoading, setBootLoading] = useState<boolean>(Boolean(localStorage.getItem(TOKEN_KEY)));

  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [authUsername, setAuthUsername] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authConfirm, setAuthConfirm] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");

  const [viewMode, setViewMode] = useState<ViewMode>("dashboard");
  const [selectedAsset, setSelectedAsset] = useState<DigitalAsset | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatSessionId, setChatSessionId] = useState<string | null>(null);
  const [sessionList, setSessionList] = useState<AgentSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState("");
  const [input, setInput] = useState("");
  const [streamState, setStreamState] = useState<StreamState>({ loading: false, label: null });
  const [draft, setDraft] = useState<string>("");
  const chatRef = useRef<HTMLDivElement>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const [users, setUsers] = useState<AuthUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState("");
  const [usersPage, setUsersPage] = useState(1);
  const [usersPageSize, setUsersPageSize] = useState(10);
  const [usersTotal, setUsersTotal] = useState(0);
  const [createUserModalOpen, setCreateUserModalOpen] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<UserRole>("user");
  const [editUserModalOpen, setEditUserModalOpen] = useState(false);
  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [editUsername, setEditUsername] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editRole, setEditRole] = useState<UserRole>("user");
  const [llmProvider, setLlmProvider] = useState("openai");
  const [llmModel, setLlmModel] = useState("gpt-4o-mini");
  const [llmBaseUrl, setLlmBaseUrl] = useState("https://api.openai.com/v1");
  const [llmApiKey, setLlmApiKey] = useState("");
  const [llmApiKeySet, setLlmApiKeySet] = useState(false);
  const [llmSkills, setLlmSkills] = useState<UserSkillConfig[]>([]);
  const [skillShopItems, setSkillShopItems] = useState<SkillShopItem[]>([]);
  const [addingSkillName, setAddingSkillName] = useState("");
  const [deletingSkillName, setDeletingSkillName] = useState("");
  const [shopModalOpen, setShopModalOpen] = useState(false);
  const [skillShopSearch, setSkillShopSearch] = useState("");
  const [skillShopSort, setSkillShopSort] = useState<"comprehensive" | "downloads" | "stars" | "latest">(
    "comprehensive",
  );
  const [skillShopPage, setSkillShopPage] = useState(1);
  const [skillShopHasMore, setSkillShopHasMore] = useState(false);
  const [skillShopLoading, setSkillShopLoading] = useState(false);
  const [skillShopLoadingMore, setSkillShopLoadingMore] = useState(false);
  const skillShopRequestIdRef = useRef(0);
  const [llmLoading, setLlmLoading] = useState(false);
  const [llmSaving, setLlmSaving] = useState(false);
  const [llmError, setLlmError] = useState("");
  const [llmSuccess, setLlmSuccess] = useState("");

  const historyPayload = useMemo(
    () =>
      messages.map((m) => ({
        role: m.role,
        content: [m.text, m.imageUrl].filter(Boolean).join("\n"),
      })),
    [messages],
  );

  const isAdmin = currentUser?.role === "admin";
  const skillShopDisplayItems = useMemo(() => {
    if (skillShopSort === "comprehensive") return skillShopItems;
    return [...skillShopItems].sort((a, b) => {
      if (skillShopSort === "downloads") return (b.downloads ?? 0) - (a.downloads ?? 0);
      if (skillShopSort === "stars") return (b.stars ?? 0) - (a.stars ?? 0);
      const av = (a.version || "").replace(/^v/i, "");
      const bv = (b.version || "").replace(/^v/i, "");
      return bv.localeCompare(av, undefined, { numeric: true, sensitivity: "base" });
    });
  }, [skillShopItems, skillShopSort]);

  const scrollToBottom = () => {
    requestAnimationFrame(() => {
      if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
    });
  };

  const setAuthSession = (auth: AuthResponse) => {
    setToken(auth.token);
    setCurrentUser(auth.user);
    localStorage.setItem(TOKEN_KEY, auth.token);
  };

  const clearAuthSession = () => {
    setToken("");
    setCurrentUser(null);
    setUserMenuOpen(false);
    setCreateUserModalOpen(false);
    setEditUserModalOpen(false);
    setEditingUserId(null);
    setEditUsername("");
    setEditPassword("");
    setEditRole("user");
    localStorage.removeItem(TOKEN_KEY);
    setMessages([]);
    setChatSessionId(null);
    setSessionList([]);
    setSessionsError("");
    setViewMode("dashboard");
    setUsers([]);
    setLlmProvider("openai");
    setLlmModel("gpt-4o-mini");
    setLlmBaseUrl("https://api.openai.com/v1");
    setLlmApiKey("");
    setLlmApiKeySet(false);
    setLlmSkills([]);
    setSkillShopItems([]);
    setAddingSkillName("");
    setDeletingSkillName("");
    setShopModalOpen(false);
    setSkillShopSearch("");
    setSkillShopSort("comprehensive");
    setSkillShopPage(1);
    setSkillShopHasMore(false);
    setSkillShopLoading(false);
    setSkillShopLoadingMore(false);
    setLlmError("");
    setLlmSuccess("");
  };

  const apiRequest = async <T,>(
    path: string,
    init: RequestInit = {},
    withAuth = true,
  ): Promise<T> => {
    const headers = new Headers(init.headers ?? {});
    if (!headers.has("Content-Type") && init.body) {
      headers.set("Content-Type", "application/json");
    }
    if (withAuth && token) {
      headers.set("Authorization", `Bearer ${token}`);
    }

    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers,
    });

    if (!response.ok) {
      let message = `请求失败 (${response.status})`;
      try {
        const data = (await response.json()) as { detail?: unknown };
        if (data?.detail) message = parseErrorDetail(data.detail);
      } catch {
        // ignore parse error
      }
      throw new Error(message);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  };

  const appendMessage = (role: ChatRole, text: string) => {
    const imageUrl = extractImageUrl(text);
    const displayText = cleanText(text, imageUrl);
    const next: ChatMessage = {
      id: crypto.randomUUID(),
      role,
      text: displayText,
      imageUrl,
      timestamp: nowTag(),
    };
    setMessages((prev) => [...prev, next]);
    scrollToBottom();
  };

  const mapMemoryToMessage = (memory: AgentMemory): ChatMessage | null => {
    if (memory.role !== "user" && memory.role !== "assistant") {
      return null;
    }
    const imageUrl = extractImageUrl(memory.content);
    const displayText = cleanText(memory.content, imageUrl);
    return {
      id: `${memory.session_id}-${memory.id}`,
      role: memory.role,
      text: displayText,
      imageUrl,
      timestamp: new Date(memory.created_at).toLocaleTimeString("zh-CN", {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };
  };

  const formatSessionTime = (isoText: string | null) => {
    if (!isoText) return "暂无消息";
    return new Date(isoText).toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const buildSessionTitle = (session: AgentSession, index: number) => {
    const raw = (session.title ?? "").trim();
    if (raw) return raw;
    return `会话 ${index + 1}`;
  };

  const handleArchive = () => {
    const blob = new Blob([JSON.stringify(messages, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `lumina-会话-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const fetchCurrentUser = async () => {
    if (!token) {
      setBootLoading(false);
      return;
    }

    try {
      const me = await apiRequest<AuthUser>("/auth/me", { method: "GET" });
      setCurrentUser(me);
    } catch {
      clearAuthSession();
    } finally {
      setBootLoading(false);
    }
  };

  const loadSessionMessages = async (sessionId: string) => {
    const memories = await apiRequest<AgentMemory[]>(
      `/agents/sessions/${sessionId}/messages?limit=500`,
      { method: "GET" },
    );
    const restored = memories
      .map((memory) => mapMemoryToMessage(memory))
      .filter((item): item is ChatMessage => Boolean(item));
    setMessages(restored);
    setChatSessionId(sessionId);
    scrollToBottom();
  };

  const fetchSessions = async (preferredSessionId?: string | null): Promise<string | null> => {
    if (!token) return null;

    setSessionsLoading(true);
    setSessionsError("");

    try {
      const sessions = await apiRequest<AgentSession[]>("/agents/sessions?limit=50", { method: "GET" });
      setSessionList(sessions);

      if (!sessions.length) {
        return null;
      }

      const target = preferredSessionId && sessions.some((s) => s.id === preferredSessionId)
        ? preferredSessionId
        : sessions[0].id;
      return target;
    } catch (error) {
      setSessionsError(error instanceof Error ? error.message : "加载会话历史失败");
      return null;
    } finally {
      setSessionsLoading(false);
    }
  };

  const createNewSession = async () => {
    if (streamState.loading) return;
    setSessionsError("");
    try {
      const created = await apiRequest<AgentSession>("/agents/sessions", { method: "POST" });
      setChatSessionId(created.id);
      setMessages([]);
      setDraft("");
      setInput("");
      const selectedId = await fetchSessions(created.id);
      if (selectedId && selectedId !== created.id) {
        await loadSessionMessages(selectedId);
      }
    } catch (error) {
      setSessionsError(error instanceof Error ? error.message : "新建会话失败");
    }
  };

  const switchSession = async (sessionId: string) => {
    if (streamState.loading || sessionId === chatSessionId) return;
    setSessionsError("");
    setDraft("");
    try {
      await loadSessionMessages(sessionId);
    } catch (error) {
      setSessionsError(error instanceof Error ? error.message : "切换会话失败");
    }
  };

  const fetchUsers = async (targetPage = usersPage, targetPageSize = usersPageSize) => {
    if (!isAdmin) return;
    setUsersLoading(true);
    setUsersError("");

    try {
      const query = new URLSearchParams({
        page: String(targetPage),
        page_size: String(targetPageSize),
      });
      const data = await apiRequest<UserListResponse>(`/users?${query.toString()}`, { method: "GET" });
      setUsers(data.items);
      setUsersTotal(data.total);
      const totalPages = Math.max(1, Math.ceil(data.total / targetPageSize));
      if (targetPage > totalPages) {
        setUsersPage(totalPages);
      }
    } catch (error) {
      setUsersError(error instanceof Error ? error.message : "加载用户失败");
    } finally {
      setUsersLoading(false);
    }
  };

  const fetchUserLlmConfig = async () => {
    try {
      const config = await apiRequest<UserLLMConfig | null>("/llm-config", { method: "GET" });
      if (!config) {
        setLlmProvider("openai");
        setLlmModel("gpt-4o-mini");
        setLlmBaseUrl("https://api.openai.com/v1");
        setLlmApiKeySet(false);
        return;
      }
      setLlmProvider(config.provider);
      setLlmModel(config.model);
      setLlmBaseUrl(config.base_url);
      setLlmApiKeySet(config.api_key_set);
    } catch (error) {
      setLlmError(error instanceof Error ? error.message : "加载模型配置失败");
    }
  };

  const fetchUserSkillConfig = async () => {
    try {
      const skills = await apiRequest<UserSkillConfig[]>("/skill-config", { method: "GET" });
      setLlmSkills(skills);
    } catch (error) {
      setLlmError(error instanceof Error ? error.message : "加载 Skill 配置失败");
    }
  };

  const fetchSkillShopItems = async (reset = false, keyword?: string) => {
    const q = (keyword ?? skillShopSearch).trim();
    const targetPage = reset ? 1 : skillShopPage + 1;
    if (!reset && !skillShopHasMore) return;
    const requestId = Date.now();
    skillShopRequestIdRef.current = requestId;
    if (reset) {
      setSkillShopLoading(true);
    } else {
      setSkillShopLoadingMore(true);
    }

    try {
      const params = new URLSearchParams();
      params.set("page", String(targetPage));
      params.set("page_size", String(SKILL_SHOP_PAGE_SIZE));
      if (q) params.set("q", q);

      const data = await apiRequest<SkillShopListResponse>(`/skill-shop?${params.toString()}`, { method: "GET" });
      if (skillShopRequestIdRef.current !== requestId) return;
      setSkillShopItems((prev) => (reset ? data.items : [...prev, ...data.items]));
      setSkillShopPage(data.page);
      setSkillShopHasMore(data.has_more);
    } catch (error) {
      setLlmError(error instanceof Error ? error.message : "加载 Skill 商店失败");
    } finally {
      if (skillShopRequestIdRef.current === requestId) {
        setSkillShopLoading(false);
        setSkillShopLoadingMore(false);
      }
    }
  };

  const loadLlmAndSkillConfig = async () => {
    setLlmLoading(true);
    setLlmError("");
    setLlmSuccess("");
    try {
      await Promise.all([fetchUserLlmConfig(), fetchUserSkillConfig(), fetchSkillShopItems(true)]);
    } finally {
      setLlmLoading(false);
    }
  };

  const addSkillToCurrentUser = async (shopItem: SkillShopItem) => {
    if (!shopItem.external_id.trim()) return;
    setAddingSkillName(shopItem.external_id);
    setLlmError("");
    setLlmSuccess("");
    try {
      await apiRequest<UserSkillConfig>("/skill-shop/add", {
        method: "POST",
        body: JSON.stringify({
          external_id: shopItem.external_id,
          enabled: true,
        }),
      });
      await Promise.all([fetchUserSkillConfig(), fetchSkillShopItems(true)]);
      setLlmSuccess(`已加入 Skill：${shopItem.name}`);
    } catch (error) {
      setLlmError(error instanceof Error ? error.message : "加入 Skill 失败");
    } finally {
      setAddingSkillName("");
    }
  };

  const removeSkillFromCurrentUser = async (skill: UserSkillConfig) => {
    const target = skill.name.trim();
    if (!target) return;
    if (!window.confirm(`确认删除 Skill「${target}」吗？`)) return;
    setDeletingSkillName(target);
    setLlmError("");
    setLlmSuccess("");
    try {
      await apiRequest<{ status: string }>(`/skill-config/${encodeURIComponent(target)}`, {
        method: "DELETE",
      });
      await Promise.all([fetchUserSkillConfig(), fetchSkillShopItems(true)]);
      setLlmSuccess(`已删除 Skill：${target}`);
    } catch (error) {
      setLlmError(error instanceof Error ? error.message : "删除 Skill 失败");
    } finally {
      setDeletingSkillName("");
    }
  };

  const openSkillShopModal = async () => {
    setShopModalOpen(true);
    await fetchSkillShopItems(true);
  };

  useEffect(() => {
    void fetchCurrentUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (token && currentUser) {
      void (async () => {
        const targetSessionId = await fetchSessions(chatSessionId);
        if (!targetSessionId) {
          setChatSessionId(null);
          setMessages([]);
          return;
        }
        await loadSessionMessages(targetSessionId);
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, currentUser?.id]);

  useEffect(() => {
    if (viewMode === "users" && isAdmin) {
      void fetchUsers();
    }
    if (viewMode === "llm") {
      void loadLlmAndSkillConfig();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, isAdmin, usersPage, usersPageSize]);

  useEffect(() => {
    if (!shopModalOpen) return;
    const timer = window.setTimeout(() => {
      void fetchSkillShopItems(true);
    }, 250);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skillShopSearch]);

  useEffect(() => {
    if (!userMenuOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!userMenuRef.current?.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") setUserMenuOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [userMenuOpen]);

  const submitAuth = async () => {
    const username = authUsername.trim();
    const password = authPassword;

    if (!username || !password) {
      setAuthError("请输入用户名和密码");
      return;
    }

    if (authMode === "register" && password !== authConfirm) {
      setAuthError("两次密码不一致");
      return;
    }

    setAuthLoading(true);
    setAuthError("");

    try {
      const endpoint = authMode === "login" ? "/auth/login" : "/auth/register";
      const auth = await apiRequest<AuthResponse>(
        endpoint,
        {
          method: "POST",
          body: JSON.stringify({ username, password }),
        },
        false,
      );

      setAuthSession(auth);
      setAuthUsername("");
      setAuthPassword("");
      setAuthConfirm("");
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "认证失败");
    } finally {
      setAuthLoading(false);
    }
  };

  const logout = async () => {
    try {
      await apiRequest<{ status: string }>("/auth/logout", { method: "POST" });
    } catch {
      // logout should always clear local state
    } finally {
      clearAuthSession();
    }
  };

  const sendMessage = async () => {
    const content = input.trim();
    if (!content || streamState.loading) return;

    appendMessage("user", content);
    setInput("");
    setDraft("");
    setStreamState({ loading: true, label: "正在思考" });

    try {
      let resolvedSessionId = chatSessionId;
      const response = await fetch(AGENT_API, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          input: content,
          session_id: chatSessionId,
          history: historyPayload,
        }),
      });

      if (response.status === 401) {
        clearAuthSession();
        throw new Error("登录已过期，请重新登录");
      }

      if (!response.ok || !response.body) {
        throw new Error("请求失败");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";
      let finalContent = "";
      let latestDraft = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const raw of parts) {
          const events = parseBlocks(raw);
          for (const event of events) {
            if (event.eventType === "session") {
              const sid = String(event.payload.session_id ?? "").trim();
              if (sid) {
                resolvedSessionId = sid;
                setChatSessionId(sid);
              }
            }

            if (event.eventType === "assistant") {
              const text = String(event.payload.content ?? "");
              if (text) {
                latestDraft = text;
                setDraft(text);
              }
            }

            if (event.eventType === "tool_call") {
              const toolCalls = event.payload.tool_calls;
              const rawText = JSON.stringify(toolCalls || "");
              if (rawText.toLowerCase().includes("image")) {
                setStreamState({ loading: true, label: "正在合成图像" });
              }
            }

            if (event.eventType === "done") {
              finalContent = String(event.payload.content ?? latestDraft ?? "");
            }

            if (event.eventType === "error") {
              const msg = String(event.payload.message ?? "请求过程中出现错误");
              appendMessage("assistant", `发生错误：${msg}`);
              setDraft("");
              setStreamState({ loading: false, label: null });
              return;
            }
          }
        }
      }

      appendMessage("assistant", finalContent || latestDraft || "我已经完成处理。\n如需继续，请告诉我下一步目标。");
      await fetchSessions(resolvedSessionId);
    } catch (error) {
      appendMessage("assistant", `发生错误：${error instanceof Error ? error.message : "未知错误"}`);
    } finally {
      setDraft("");
      setStreamState({ loading: false, label: null });
      scrollToBottom();
    }
  };

  const createUserByAdmin = async () => {
    const username = newUsername.trim();
    if (!username || !newPassword) return;

    setUsersError("");
    try {
      await apiRequest<AuthUser>("/users", {
        method: "POST",
        body: JSON.stringify({ username, password: newPassword, role: newRole }),
      });
      setNewUsername("");
      setNewPassword("");
      setNewRole("user");
      setCreateUserModalOpen(false);
      setUsersPage(1);
      await fetchUsers(1, usersPageSize);
    } catch (error) {
      setUsersError(error instanceof Error ? error.message : "创建用户失败");
    }
  };

  const openEditUserModal = (user: AuthUser) => {
    setEditingUserId(user.id);
    setEditUsername(user.username);
    setEditRole(user.role);
    setEditPassword("");
    setEditUserModalOpen(true);
    setUsersError("");
  };

  const saveUser = async () => {
    if (!editingUserId) return;
    const username = editUsername.trim();
    if (!username) return;

    setUsersError("");
    try {
      await apiRequest<AuthUser>(`/users/${editingUserId}`, {
        method: "PATCH",
        body: JSON.stringify({
          username,
          role: editRole,
          password: editPassword || undefined,
        }),
      });
      setEditUserModalOpen(false);
      setEditingUserId(null);
      setEditUsername("");
      setEditPassword("");
      setEditRole("user");
      await fetchUsers(usersPage, usersPageSize);
    } catch (error) {
      setUsersError(error instanceof Error ? error.message : "更新失败");
    }
  };

  const removeUser = async (userId: number) => {
    setUsersError("");
    try {
      await apiRequest<{ status: string }>(`/users/${userId}`, { method: "DELETE" });
      await fetchUsers(usersPage, usersPageSize);
    } catch (error) {
      setUsersError(error instanceof Error ? error.message : "删除失败");
    }
  };

  const saveLlmConfig = async () => {
    if (!llmProvider.trim() || !llmModel.trim() || !llmBaseUrl.trim()) {
      setLlmError("请完整填写 Provider、模型和 Base URL");
      return;
    }

    setLlmSaving(true);
    setLlmError("");
    setLlmSuccess("");

    try {
      const payload: Record<string, string> = {
        provider: llmProvider.trim(),
        model: llmModel.trim(),
        base_url: llmBaseUrl.trim(),
      };
      if (llmApiKey.trim()) {
        payload.api_key = llmApiKey.trim();
      }

      const next = await apiRequest<UserLLMConfig>("/llm-config", {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      await apiRequest<UserSkillConfig[]>("/skill-config", {
        method: "PUT",
        body: JSON.stringify({
          skills: llmSkills.map((skill) => ({
            name: skill.name,
            enabled: skill.enabled,
          })),
        }),
      });
      setLlmApiKeySet(next.api_key_set);
      setLlmApiKey("");
      setLlmSuccess("模型配置已保存");
    } catch (error) {
      setLlmError(error instanceof Error ? error.message : "保存模型配置失败");
    } finally {
      setLlmSaving(false);
    }
  };

  if (bootLoading) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-6 text-[16px] font-medium text-slate-800">
        <div className="mx-auto flex h-[calc(100vh-3rem)] w-full max-w-5xl items-center justify-center rounded-3xl border border-slate-200 bg-white/70 p-6 shadow-soft backdrop-blur-sm">
          <div className="inline-flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-600">
            <Loader2 size={16} className="animate-spin text-blue-600" />
            <p>正在恢复登录状态...</p>
          </div>
        </div>
      </main>
    );
  }

  if (!currentUser) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-6 text-[16px] font-medium text-slate-800">
        <div className="mx-auto flex h-[calc(100vh-3rem)] w-full max-w-5xl items-center justify-center rounded-3xl border border-slate-200 bg-white/70 p-6 shadow-soft backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-6 flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-white">
                <Sparkles size={18} />
              </span>
              <div>
                <h1 className="font-title text-2xl font-bold leading-tight text-slate-800">TwinMind</h1>
                <p className="text-[11px] font-bold tracking-widest text-slate-400">用户登录中心</p>
              </div>
            </div>

            <div className="mb-4 grid grid-cols-2 gap-2 rounded-2xl bg-blue-50 p-1">
              <button
                type="button"
                className={`rounded-xl px-3 py-2 text-sm font-bold transition ${
                  authMode === "login" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500"
                }`}
                onClick={() => setAuthMode("login")}
              >
                登录
              </button>
              <button
                type="button"
                className={`rounded-xl px-3 py-2 text-sm font-bold transition ${
                  authMode === "register" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500"
                }`}
                onClick={() => setAuthMode("register")}
              >
                注册
              </button>
            </div>

            <div className="space-y-3">
              <input
                className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-[15px] text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                placeholder="用户名（3-32 位）"
                value={authUsername}
                onChange={(e) => setAuthUsername(e.target.value)}
              />
              <input
                type="password"
                className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-[15px] text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                placeholder="密码（至少 6 位）"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
              />
              {authMode === "register" && (
                <input
                  type="password"
                  className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-[15px] text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                  placeholder="确认密码"
                  value={authConfirm}
                  onChange={(e) => setAuthConfirm(e.target.value)}
                />
              )}
            </div>

            {authError && <p className="mt-3 text-sm text-red-500">{authError}</p>}

            <button
              type="button"
              className="mt-4 flex h-11 w-full items-center justify-center rounded-2xl bg-blue-600 text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
              disabled={authLoading}
              onClick={() => void submitAuth()}
            >
              {authLoading ? <Loader2 size={16} className="animate-spin" /> : authMode === "login" ? "立即登录" : "立即注册"}
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-3 py-4 text-[16px] font-medium text-slate-900 lg:px-5 lg:py-6">
      <div className="mx-auto flex h-[calc(100vh-2rem)] w-full max-w-[1600px] overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-soft lg:h-[calc(100vh-3rem)]">
        <aside className="flex w-64 shrink-0 flex-col border-r border-slate-200 bg-white">
          <div className="flex items-center gap-3 p-6">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white shadow-lg shadow-blue-200">
              <Sparkles size={18} />
            </span>
            <div>
              <h1 className="font-title text-xl font-bold tracking-tight text-slate-800">TwinMind</h1>
              <p className="text-[11px] font-bold tracking-widest text-slate-400">RCA Assistant</p>
            </div>
          </div>

          <nav className="flex-1 space-y-1 px-4 pb-4">
            <button
              className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm transition-colors ${
                viewMode === "dashboard"
                  ? "bg-blue-50 font-semibold text-blue-600"
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
              }`}
              type="button"
              onClick={() => setViewMode("dashboard")}
            >
              <LayoutDashboard size={18} /> 仪表盘
            </button>
            <button
              className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm transition-colors ${
                viewMode === "chat"
                  ? "bg-blue-50 font-semibold text-blue-600"
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
              }`}
              type="button"
              onClick={() => setViewMode("chat")}
            >
              <MessageSquare size={18} /> RCA 助手
            </button>
            <button
              className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm transition-colors ${
                viewMode === "assets"
                  ? "bg-blue-50 font-semibold text-blue-600"
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
              }`}
              type="button"
              onClick={() => setViewMode("assets")}
            >
              <Database size={18} /> 数字资产
            </button>
            <button
              className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm transition-colors ${
                viewMode === "scenes"
                  ? "bg-blue-50 font-semibold text-blue-600"
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
              }`}
              type="button"
              onClick={() => setViewMode("scenes")}
            >
              <Image size={18} /> 场景配置
            </button>
            <button
              className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm transition-colors ${
                viewMode === "alarms"
                  ? "bg-blue-50 font-semibold text-blue-600"
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
              }`}
              type="button"
              onClick={() => setViewMode("alarms")}
            >
              <ShieldAlert size={18} /> 告警中心
            </button>
            <button
              className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm transition-colors ${
                viewMode === "status"
                  ? "bg-blue-50 font-semibold text-blue-600"
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
              }`}
              type="button"
              onClick={() => setViewMode("status")}
            >
              <Activity size={18} /> 系统状态
            </button>
            <button
              className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm transition-colors ${
                viewMode === "llm"
                  ? "bg-blue-50 font-semibold text-blue-600"
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
              }`}
              type="button"
              onClick={() => setViewMode("llm")}
            >
              <Settings size={18} /> 模型配置
            </button>
            {isAdmin && (
              <button
                className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm transition-colors ${
                  viewMode === "users"
                    ? "bg-blue-50 font-semibold text-blue-600"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                }`}
                type="button"
                onClick={() => setViewMode("users")}
              >
                <Shield size={18} /> 用户管理
              </button>
            )}
          </nav>

        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <h2 className="font-title text-lg font-bold text-slate-800">
              {viewMode === "dashboard"
                ? "系统概览"
                : viewMode === "chat"
                  ? "RCA 助手"
                  : viewMode === "assets"
                    ? "数字资产"
                    : viewMode === "scenes"
                      ? "场景配置"
                    : viewMode === "scene3d"
                      ? "模型漫游"
                    : viewMode === "alarms"
                      ? "告警中心"
                      : viewMode === "status"
                        ? "系统状态"
                        : viewMode === "llm"
                          ? "模型配置"
                          : "用户管理"}
            </h2>
            <div className="relative" ref={userMenuRef}>
              <button
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600 transition-colors hover:bg-slate-100"
                type="button"
                onClick={() => setUserMenuOpen((prev) => !prev)}
              >
                <Shield size={14} />
                {currentUser.username} ({currentUser.role})
                <ChevronDown size={14} className={`transition-transform ${userMenuOpen ? "rotate-180" : ""}`} />
              </button>
              {userMenuOpen && (
                <div className="absolute right-0 z-20 mt-2 w-44 overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
                  <button
                    className="inline-flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-100"
                    type="button"
                    onClick={() => {
                      setUserMenuOpen(false);
                      void logout();
                    }}
                  >
                    <LogOut size={14} />
                    退出登录
                  </button>
                </div>
              )}
            </div>
          </header>

          <div className="min-h-0 flex-1">
            {viewMode === "dashboard" ? (
              <DashboardPanel />
            ) : viewMode === "assets" ? (
              <DigitalAssetsPanel
                apiBaseUrl={API_BASE_URL}
                token={token}
                onOpenModelScene={(asset) => {
                  setSelectedAsset(asset);
                  setViewMode("scene3d");
                }}
              />
            ) : viewMode === "scenes" ? (
              <SceneConfigPanel apiBaseUrl={API_BASE_URL} token={token} />
            ) : viewMode === "scene3d" ? (
              <Scene3DPanel
                apiBaseUrl={API_BASE_URL}
                token={token}
                asset={selectedAsset}
                onBackToAssets={() => setViewMode("assets")}
              />
            ) : viewMode === "alarms" ? (
              <AlarmsPanel />
            ) : viewMode === "status" ? (
              <SystemStatusPanel />
            ) : viewMode === "llm" ? (
          <section className="flex-1 overflow-y-auto bg-slate-50/30 p-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="mb-3 font-title text-xl font-bold text-slate-800">我的模型 API 配置</h2>
              <p className="mb-4 text-sm text-slate-500">每个账号独立保存，聊天请求会优先使用当前账号配置。</p>

              {llmError && <p className="mb-3 text-sm text-red-500">{llmError}</p>}
              {llmSuccess && <p className="mb-3 text-sm text-emerald-600">{llmSuccess}</p>}

              {llmLoading ? (
                <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-blue-50 px-3 py-2 text-slate-600">
                  <Loader2 size={14} className="animate-spin text-blue-600" />
                  <span>加载配置中...</span>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <label className="space-y-1 text-sm">
                      <span className="text-slate-600">Provider</span>
                      <input
                        className="h-10 w-full rounded-xl border border-slate-200 px-3 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                        value={llmProvider}
                        onChange={(e) => setLlmProvider(e.target.value)}
                        placeholder="openai / deepseek / qwen ..."
                      />
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="text-slate-600">Model</span>
                      <input
                        className="h-10 w-full rounded-xl border border-slate-200 px-3 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                        value={llmModel}
                        onChange={(e) => setLlmModel(e.target.value)}
                        placeholder="gpt-4o-mini"
                      />
                    </label>
                  </div>

                  <label className="space-y-1 text-sm">
                    <span className="text-slate-600">Base URL</span>
                    <input
                      className="h-10 w-full rounded-xl border border-slate-200 px-3 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                      value={llmBaseUrl}
                      onChange={(e) => setLlmBaseUrl(e.target.value)}
                      placeholder="https://api.openai.com/v1"
                    />
                  </label>

                  <label className="space-y-1 text-sm">
                    <span className="text-slate-600">API Key {llmApiKeySet ? "(已保存)" : "(未保存)"}</span>
                    <input
                      type="password"
                      className="h-10 w-full rounded-xl border border-slate-200 px-3 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                      value={llmApiKey}
                      onChange={(e) => setLlmApiKey(e.target.value)}
                      placeholder="留空则保持现有密钥不变"
                    />
                  </label>

                  <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-slate-700">Skills（用户隔离）</p>
                      <button
                        type="button"
                        className="inline-flex h-8 items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-600 transition hover:bg-slate-50 hover:text-blue-600"
                        onClick={() => void openSkillShopModal()}
                      >
                        <ShoppingBag size={14} />
                        Skill 商店
                      </button>
                    </div>
                    {!llmSkills.length ? (
                      <p className="text-sm text-slate-500">当前没有可配置的 Skill。</p>
                    ) : (
                      <div className="space-y-2">
                        {llmSkills.map((skill) => (
                          <div
                            key={skill.name}
                            className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2"
                          >
                            <label className="flex min-w-0 flex-1 items-start gap-2">
                              <input
                                type="checkbox"
                                checked={skill.enabled}
                                onChange={(e) =>
                                  setLlmSkills((prev) =>
                                    prev.map((item) =>
                                      item.name === skill.name
                                        ? {
                                            ...item,
                                            enabled: e.target.checked,
                                          }
                                        : item,
                                    ),
                                  )
                                }
                                className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                              />
                              <span className="min-w-0">
                                <span className="block text-sm font-semibold text-slate-700">
                                  {skill.name}
                                  <span className="ml-2 text-xs font-normal text-slate-500">({skill.source})</span>
                                </span>
                                <span className="block truncate text-xs text-slate-500">{skill.path}</span>
                                <span className="block text-xs text-slate-600">{skill.description || "无描述"}</span>
                              </span>
                            </label>
                            <button
                              type="button"
                              className="inline-flex h-8 shrink-0 items-center justify-center gap-1 rounded-lg border border-red-200 px-2 text-xs text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                              onClick={() => void removeSkillFromCurrentUser(skill)}
                              disabled={deletingSkillName === skill.name}
                            >
                              {deletingSkillName === skill.name ? (
                                <Loader2 size={14} className="animate-spin" />
                              ) : (
                                <Trash2 size={14} />
                              )}
                              删除
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    className="inline-flex h-10 items-center justify-center rounded-xl bg-blue-600 px-4 text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                    onClick={() => void saveLlmConfig()}
                    disabled={llmSaving}
                  >
                    {llmSaving ? <Loader2 size={14} className="animate-spin" /> : "保存配置"}
                  </button>
                </div>
              )}
            </div>
            {shopModalOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
                <div className="flex h-[78vh] w-full max-w-7xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-[#ececf2] shadow-xl">
                  <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                    <p className="text-base font-semibold text-slate-800">Skill 商店</p>
                    <button
                      type="button"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
                      onClick={() => setShopModalOpen(false)}
                    >
                      <X size={14} />
                    </button>
                  </div>
                  <div className="border-b border-slate-200 bg-[#ececf2] px-5 py-4">
                    <div className="flex items-center gap-3">
                      <input
                        className="h-12 w-full rounded-2xl border border-slate-200/70 bg-white px-4 text-sm text-slate-700 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                        placeholder="搜索 skill 名称、来源、描述..."
                        value={skillShopSearch}
                        onChange={(e) => setSkillShopSearch(e.target.value)}
                      />
                      <select
                        className="h-12 min-w-[132px] rounded-2xl border border-slate-200/70 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                        value={skillShopSort}
                        onChange={(e) =>
                          setSkillShopSort(
                            e.target.value as "comprehensive" | "downloads" | "stars" | "latest",
                          )
                        }
                      >
                        <option value="comprehensive">综合排序</option>
                        <option value="downloads">下载量优先</option>
                        <option value="stars">星标优先</option>
                        <option value="latest">版本优先</option>
                      </select>
                    </div>
                  </div>
                  <div
                    className="min-h-0 flex-1 overflow-y-auto bg-[#ececf2] p-5"
                    onScroll={(e) => {
                      const el = e.currentTarget;
                      const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 40;
                      if (nearBottom && skillShopHasMore && !skillShopLoadingMore && !skillShopLoading) {
                        void fetchSkillShopItems(false);
                      }
                    }}
                  >
                    {skillShopLoading ? (
                      <div className="flex items-center justify-center py-8 text-sm text-slate-500">
                        <Loader2 size={14} className="mr-2 animate-spin text-blue-600" />
                        加载中...
                      </div>
                    ) : !skillShopItems.length ? (
                      <p className="rounded-lg border border-dashed border-slate-200 bg-white px-3 py-8 text-center text-sm text-slate-500">
                        没有匹配的 Skill
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {skillShopDisplayItems.map((item) => {
                          const iconText = item.name.trim().slice(0, 1).toUpperCase() || "S";
                          const iconStyle = skillAccentClass(item.name);
                          return (
                            <article
                              key={item.external_id}
                              className="rounded-3xl border border-slate-200/80 bg-white/95 p-5 shadow-sm transition hover:shadow-md"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex min-w-0 items-start gap-3">
                                  {item.icon_url ? (
                                    <img
                                      src={item.icon_url}
                                      alt={item.name}
                                      className="h-14 w-14 rounded-2xl border border-slate-200 object-cover"
                                    />
                                  ) : (
                                    <div
                                      className={`inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border text-2xl font-semibold ${iconStyle}`}
                                    >
                                      {iconText}
                                    </div>
                                  )}
                                  <div className="min-w-0">
                                    <p className="truncate text-xl font-semibold text-slate-800">{item.name}</p>
                                    <div className="mt-1 flex items-center gap-2">
                                      {item.tag && (
                                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">
                                          {item.tag}
                                        </span>
                                      )}
                                      <span className="truncate text-xs text-slate-400">{item.source}</span>
                                    </div>
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  className="inline-flex h-9 shrink-0 items-center justify-center rounded-xl border border-blue-200 px-3 text-xs font-medium text-blue-600 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
                                  disabled={item.added || addingSkillName === item.external_id}
                                  onClick={() => void addSkillToCurrentUser(item)}
                                >
                                  {item.added ? "已加入" : addingSkillName === item.external_id ? "加入中..." : "加入"}
                                </button>
                              </div>
                              <p
                                className="mt-3 min-h-12 text-sm leading-6 text-slate-500"
                                style={{
                                  display: "-webkit-box",
                                  WebkitLineClamp: 2,
                                  WebkitBoxOrient: "vertical",
                                  overflow: "hidden",
                                }}
                              >
                                {item.description || "暂无描述"}
                              </p>
                              <div className="mt-4 flex items-center gap-4 text-sm text-slate-400">
                                <span className="inline-flex items-center gap-1">
                                  <Download size={14} />
                                  {formatCompactCount(item.downloads)}
                                </span>
                                <span className="inline-flex items-center gap-1">
                                  <Star size={14} />
                                  {formatCompactCount(item.stars)}
                                </span>
                                <span className="inline-flex items-center gap-1">
                                  <Package size={14} />
                                  {item.version || "v0.1.0"}
                                </span>
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    )}
                    {skillShopLoadingMore && (
                      <div className="py-2 text-center text-xs text-slate-500">正在加载更多...</div>
                    )}
                    {!skillShopLoading && skillShopHasMore && !skillShopLoadingMore && (
                      <div className="py-2 text-center text-xs text-slate-500">下滑加载更多...</div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </section>
        ) : viewMode === "users" && isAdmin ? (
          <section className="flex-1 overflow-y-auto bg-slate-50/30 p-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-3 flex items-center justify-end gap-3">
                <button
                  type="button"
                  className="btn-top-primary"
                  onClick={() => {
                    setUsersError("");
                    setCreateUserModalOpen(true);
                  }}
                >
                  <UserPlus size={14} /> 新增用户
                </button>
              </div>
              {usersError && <p className="mb-3 text-sm text-red-500">{usersError}</p>}
              {usersLoading ? (
                <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-blue-50 px-3 py-2 text-slate-600">
                  <Loader2 size={14} className="animate-spin text-blue-600" />
                  <span>加载中...</span>
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl border border-slate-200">
                  <table className="w-full border-collapse text-left">
                    <thead>
                      <tr className="bg-slate-50">
                        <th className="table-th">用户名</th>
                        <th className="table-th">角色</th>
                        <th className="table-th">创建时间</th>
                        <th className="table-th">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {users.map((u) => {
                        const isSelf = currentUser.id === u.id;
                        return (
                          <tr key={u.id} className="hover:bg-slate-50/60">
                            <td className="table-td text-sm text-slate-700">{u.username}</td>
                            <td className="table-td text-sm text-slate-500">{u.role}</td>
                            <td className="table-td text-sm text-slate-500">{new Date(u.created_at).toLocaleDateString()}</td>
                            <td className="table-td">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  type="button"
                                  className="inline-flex h-8 items-center justify-center rounded-md border border-slate-200 px-2 text-xs text-slate-600 transition hover:bg-slate-50 hover:text-slate-800"
                                  onClick={() => openEditUserModal(u)}
                                >
                                  编辑
                                </button>
                                <button
                                  type="button"
                                  className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-red-200 px-2 text-xs text-red-500 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                                  onClick={() => void removeUser(u.id)}
                                  disabled={isSelf}
                                >
                                  <Trash2 size={12} /> 删除
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <PaginationControls
                page={usersPage}
                pageSize={usersPageSize}
                total={usersTotal}
                onPageChange={(page) => setUsersPage(page)}
                onPageSizeChange={(size) => {
                  setUsersPageSize(size);
                  setUsersPage(1);
                }}
              />
            </div>

            {createUserModalOpen && (
              <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/35 p-4">
                <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="font-title text-lg font-bold text-slate-800">新增用户</h3>
                    <button
                      type="button"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
                      onClick={() => setCreateUserModalOpen(false)}
                    >
                      <X size={16} />
                    </button>
                  </div>
                  <div className="space-y-3">
                    <input
                      className="h-10 w-full rounded-xl border border-slate-200 px-3 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                      placeholder="用户名"
                      value={newUsername}
                      onChange={(e) => setNewUsername(e.target.value)}
                    />
                    <input
                      type="password"
                      className="h-10 w-full rounded-xl border border-slate-200 px-3 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                      placeholder="初始密码"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                    />
                    <select
                      className="h-10 w-full rounded-xl border border-slate-200 px-3 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                      value={newRole}
                      onChange={(e) => setNewRole(e.target.value as UserRole)}
                    >
                      <option value="user">user</option>
                      <option value="admin">admin</option>
                    </select>
                  </div>
                  <div className="mt-5 flex justify-end gap-2">
                    <button
                      type="button"
                      className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-200 px-3 text-sm text-slate-600 transition hover:bg-slate-50"
                      onClick={() => setCreateUserModalOpen(false)}
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      className="inline-flex h-9 items-center justify-center rounded-lg bg-blue-600 px-3 text-sm text-white transition hover:bg-blue-700"
                      onClick={() => void createUserByAdmin()}
                    >
                      确认创建
                    </button>
                  </div>
                </div>
              </div>
            )}

            {editUserModalOpen && (
              <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/35 p-4">
                <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="font-title text-lg font-bold text-slate-800">编辑用户</h3>
                    <button
                      type="button"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
                      onClick={() => setEditUserModalOpen(false)}
                    >
                      <X size={16} />
                    </button>
                  </div>
                  <div className="space-y-3">
                    <input
                      className="h-10 w-full rounded-xl border border-slate-200 px-3 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                      placeholder="用户名"
                      value={editUsername}
                      onChange={(e) => setEditUsername(e.target.value)}
                    />
                    <select
                      className="h-10 w-full rounded-xl border border-slate-200 px-3 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                      value={editRole}
                      onChange={(e) => setEditRole(e.target.value as UserRole)}
                      disabled={editingUserId === currentUser.id}
                    >
                      <option value="user">user</option>
                      <option value="admin">admin</option>
                    </select>
                    <input
                      type="password"
                      className="h-10 w-full rounded-xl border border-slate-200 px-3 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                      placeholder="新密码（留空则不改）"
                      value={editPassword}
                      onChange={(e) => setEditPassword(e.target.value)}
                    />
                  </div>
                  <div className="mt-5 flex justify-end gap-2">
                    <button
                      type="button"
                      className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-200 px-3 text-sm text-slate-600 transition hover:bg-slate-50"
                      onClick={() => setEditUserModalOpen(false)}
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      className="inline-flex h-9 items-center justify-center rounded-lg bg-blue-600 px-3 text-sm text-white transition hover:bg-blue-700"
                      onClick={() => void saveUser()}
                    >
                      保存修改
                    </button>
                  </div>
                </div>
              </div>
            )}
          </section>
        ) : (
          <div className="flex h-full min-h-0 flex-col lg:flex-row">
            <div className="flex min-h-0 flex-1 flex-col">
              <section ref={chatRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-slate-50/30 p-6">
                <AnimatePresence initial={false}>
                  {messages.map((msg) => {
                    const isUser = msg.role === "user";
                    return (
                      <motion.article
                        key={msg.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 6 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                        className={`flex items-start gap-3 ${isUser ? "justify-end" : "justify-start"}`}
                      >
                        {!isUser && (
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white">
                            <Bot size={16} />
                          </div>
                        )}
                        <div
                          className={`max-w-[82%] rounded-2xl border border-slate-200 px-4 py-3 shadow-sm ${
                            isUser ? "bg-blue-600 text-white" : "bg-white text-slate-800"
                          }`}
                        >
                          {msg.text && <p className="whitespace-pre-wrap leading-[1.6]">{msg.text}</p>}
                          {msg.imageUrl && (
                            <motion.div
                              initial={{ opacity: 0, scale: 0.96 }}
                              animate={{ opacity: 1, scale: 1 }}
                              transition={{ duration: 0.22 }}
                              className="mt-2 overflow-hidden rounded-2xl border border-slate-200"
                            >
                              <img src={msg.imageUrl} alt="生成图像" className="h-auto w-full object-cover" />
                            </motion.div>
                          )}
                          <p className={`mt-2 text-[11px] font-bold tracking-widest ${isUser ? "text-blue-100" : "text-slate-400"}`}>{msg.timestamp}</p>
                        </div>
                        {isUser && (
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600">
                            <User size={16} />
                          </div>
                        )}
                      </motion.article>
                    );
                  })}
                </AnimatePresence>

                {draft && (
                  <motion.article initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white">
                      <Bot size={16} />
                    </div>
                    <div className="max-w-[82%] rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-800 shadow-sm">
                      <p className="whitespace-pre-wrap leading-[1.6]">{draft}</p>
                    </div>
                  </motion.article>
                )}

                {streamState.loading && streamState.label && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 text-white">
                      <Loader2 size={16} className="animate-spin" />
                    </div>
                    <div className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-700 shadow-sm">
                      <span className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
                      <p className="leading-[1.6]">{streamState.label}</p>
                    </div>
                  </motion.div>
                )}
              </section>

              <footer className="border-t border-slate-200 bg-white p-4">
                <div className="rounded-3xl border border-slate-200 bg-white p-3 shadow-soft">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-blue-600"
                      title="上传图像"
                    >
                      <Image size={18} />
                    </button>
                    <input
                      className="h-10 flex-1 rounded-2xl border border-slate-200 bg-white px-4 text-[16px] font-medium leading-[1.6] text-slate-800 outline-none transition-colors duration-200 placeholder:text-slate-400 focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                      placeholder="输入你的问题，按回车发送"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          void sendMessage();
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-600 text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                      onClick={() => void sendMessage()}
                      disabled={streamState.loading}
                      title="发送消息"
                    >
                      <Send size={18} />
                    </button>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between px-1 text-[11px] font-bold tracking-widest text-slate-400">
                  <div className="space-y-1">
                    <p>版权所有 2026 Lumina 智能系统</p>
                    <p>由 React Agent 流式接口驱动</p>
                  </div>
                  <button className="text-slate-500 transition hover:text-blue-600" type="button" onClick={handleArchive}>
                    存档
                  </button>
                </div>
              </footer>
            </div>

            <aside className="flex h-72 shrink-0 flex-col border-t border-slate-200 bg-white lg:h-auto lg:w-80 lg:border-l lg:border-t-0">
              <div className="border-b border-slate-200 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-700">会话历史</p>
                  <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
                    {sessionList.length}
                  </span>
                </div>
                <button
                  type="button"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                  onClick={() => void createNewSession()}
                  disabled={streamState.loading}
                >
                  <Plus size={14} /> 新建会话
                </button>
                {sessionsError && <p className="mt-2 text-xs text-red-500">{sessionsError}</p>}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-3">
                {sessionsLoading ? (
                  <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    <Loader2 size={12} className="animate-spin text-blue-600" />
                    加载会话中...
                  </div>
                ) : !sessionList.length ? (
                  <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-5 text-center text-xs text-slate-500">
                    暂无历史会话
                  </p>
                ) : (
                  <div className="space-y-2">
                    {sessionList.map((session, index) => {
                      const active = session.id === chatSessionId;
                      return (
                        <button
                          key={session.id}
                          type="button"
                          className={`w-full rounded-xl border px-3 py-2 text-left transition ${
                            active
                              ? "border-blue-200 bg-blue-50"
                              : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                          }`}
                          onClick={() => void switchSession(session.id)}
                          disabled={streamState.loading}
                        >
                          <p className={`truncate text-sm font-semibold ${active ? "text-blue-700" : "text-slate-700"}`}>
                            {buildSessionTitle(session, index)}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">{formatSessionTime(session.last_message_at ?? session.created_at)}</p>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </aside>
          </div>
        )}
      </div>
        </div>
      </div>
    </main>
  );
}
