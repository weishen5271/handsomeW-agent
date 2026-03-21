import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Activity,
  Box,
  Bot,
  Database,
  Image,
  LayoutDashboard,
  Loader2,
  LogOut,
  MessageSquare,
  Send,
  Settings,
  Shield,
  ShieldAlert,
  Sparkles,
  Trash2,
  User,
  UserPlus,
} from "lucide-react";
import AlarmsPanel from "./components/AlarmsPanel";
import DashboardPanel from "./components/DashboardPanel";
import DigitalAssetsPanel from "./components/DigitalAssetsPanel";
import type { DigitalAsset } from "./components/DigitalAssetsPanel";
import Scene3DPanel from "./components/Scene3DPanel";
import SystemStatusPanel from "./components/SystemStatusPanel";

type ChatRole = "user" | "assistant";
type ViewMode = "dashboard" | "chat" | "assets" | "scene3d" | "alarms" | "status" | "users" | "llm";
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

type EditableUser = {
  username: string;
  role: UserRole;
  password: string;
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

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000").replace(/\/+$/, "");
const AGENT_API = `${API_BASE_URL}/agents/react/chat/stream`;
const TOKEN_KEY = "lumina_auth_token";

function nowTag() {
  return new Date().toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });
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
  const [input, setInput] = useState("");
  const [streamState, setStreamState] = useState<StreamState>({ loading: false, label: null });
  const [draft, setDraft] = useState<string>("");
  const chatRef = useRef<HTMLDivElement>(null);

  const [users, setUsers] = useState<AuthUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<UserRole>("user");
  const [editStates, setEditStates] = useState<Record<number, EditableUser>>({});
  const [llmProvider, setLlmProvider] = useState("openai");
  const [llmModel, setLlmModel] = useState("gpt-4o-mini");
  const [llmBaseUrl, setLlmBaseUrl] = useState("https://api.openai.com/v1");
  const [llmApiKey, setLlmApiKey] = useState("");
  const [llmApiKeySet, setLlmApiKeySet] = useState(false);
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
    localStorage.removeItem(TOKEN_KEY);
    setViewMode("dashboard");
    setUsers([]);
    setLlmProvider("openai");
    setLlmModel("gpt-4o-mini");
    setLlmBaseUrl("https://api.openai.com/v1");
    setLlmApiKey("");
    setLlmApiKeySet(false);
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

  const fetchUsers = async () => {
    if (!isAdmin) return;
    setUsersLoading(true);
    setUsersError("");

    try {
      const list = await apiRequest<AuthUser[]>("/users", { method: "GET" });
      setUsers(list);
      setEditStates(
        Object.fromEntries(
          list.map((u) => [u.id, { username: u.username, role: u.role, password: "" }]),
        ),
      );
    } catch (error) {
      setUsersError(error instanceof Error ? error.message : "加载用户失败");
    } finally {
      setUsersLoading(false);
    }
  };

  const fetchUserLlmConfig = async () => {
    setLlmLoading(true);
    setLlmError("");
    setLlmSuccess("");

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
    } finally {
      setLlmLoading(false);
    }
  };

  useEffect(() => {
    void fetchCurrentUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (viewMode === "users" && isAdmin) {
      void fetchUsers();
    }
    if (viewMode === "llm") {
      void fetchUserLlmConfig();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, isAdmin]);

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
      const response = await fetch(AGENT_API, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          input: content,
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
      await fetchUsers();
    } catch (error) {
      setUsersError(error instanceof Error ? error.message : "创建用户失败");
    }
  };

  const saveUser = async (userId: number) => {
    const state = editStates[userId];
    if (!state) return;

    setUsersError("");
    try {
      await apiRequest<AuthUser>(`/users/${userId}`, {
        method: "PATCH",
        body: JSON.stringify({
          username: state.username,
          role: state.role,
          password: state.password || undefined,
        }),
      });
      await fetchUsers();
    } catch (error) {
      setUsersError(error instanceof Error ? error.message : "更新失败");
    }
  };

  const removeUser = async (userId: number) => {
    setUsersError("");
    try {
      await apiRequest<{ status: string }>(`/users/${userId}`, { method: "DELETE" });
      await fetchUsers();
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
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-[16px] font-medium text-slate-900">
      <div className="mx-auto flex h-[calc(100vh-3rem)] w-full max-w-7xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-soft">
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
                viewMode === "scene3d"
                  ? "bg-blue-50 font-semibold text-blue-600"
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
              }`}
              type="button"
              onClick={() => setViewMode("scene3d")}
            >
              <Box size={18} /> 三维场景
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

          <div className="border-t border-slate-100 p-4">
            <button
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-800"
              type="button"
              onClick={() => void logout()}
            >
              <LogOut size={14} /> 退出登录
            </button>
          </div>
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
                    : viewMode === "scene3d"
                      ? "三维场景"
                    : viewMode === "alarms"
                      ? "告警中心"
                      : viewMode === "status"
                        ? "系统状态"
                        : viewMode === "llm"
                          ? "模型配置"
                          : "用户管理"}
            </h2>
            <span className="inline-flex items-center rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600">
              <Shield size={14} className="mr-1" />
              {currentUser.username} ({currentUser.role})
            </span>
          </header>

          <div className="min-h-0 flex-1">
            {viewMode === "dashboard" ? (
              <DashboardPanel />
            ) : viewMode === "assets" ? (
              <DigitalAssetsPanel
                onOpenModelScene={(asset) => {
                  setSelectedAsset(asset);
                  setViewMode("scene3d");
                }}
              />
            ) : viewMode === "scene3d" ? (
              <Scene3DPanel asset={selectedAsset} onBackToAssets={() => setViewMode("assets")} />
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
          </section>
        ) : viewMode === "users" && isAdmin ? (
          <section className="flex-1 overflow-y-auto bg-slate-50/30 p-6">
            <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="mb-3 font-title text-xl font-bold text-slate-800">新增用户</h2>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
                <input
                  className="h-10 rounded-xl border border-slate-200 px-3 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                  placeholder="用户名"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                />
                <input
                  type="password"
                  className="h-10 rounded-xl border border-slate-200 px-3 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                  placeholder="初始密码"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
                <select
                  className="h-10 rounded-xl border border-slate-200 px-3 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as UserRole)}
                >
                  <option value="user">user</option>
                  <option value="admin">admin</option>
                </select>
                <button
                  type="button"
                  className="inline-flex h-10 items-center justify-center gap-1 rounded-xl bg-blue-600 px-3 text-white transition hover:bg-blue-700"
                  onClick={() => void createUserByAdmin()}
                >
                  <UserPlus size={14} /> 创建
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="mb-3 font-title text-xl font-bold text-slate-800">用户列表</h2>
              {usersError && <p className="mb-3 text-sm text-red-500">{usersError}</p>}
              {usersLoading ? (
                <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-blue-50 px-3 py-2 text-slate-600">
                  <Loader2 size={14} className="animate-spin text-blue-600" />
                  <span>加载中...</span>
                </div>
              ) : (
                <div className="space-y-2">
                  {users.map((u) => {
                    const state = editStates[u.id] ?? { username: u.username, role: u.role, password: "" };
                    const isSelf = currentUser.id === u.id;
                    return (
                      <div key={u.id} className="grid grid-cols-1 gap-2 rounded-xl border border-slate-200 p-3 md:grid-cols-6">
                        <input
                          className="h-9 rounded-lg border border-slate-200 px-2 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                          value={state.username}
                          onChange={(e) =>
                            setEditStates((prev) => ({
                              ...prev,
                              [u.id]: { ...state, username: e.target.value },
                            }))
                          }
                        />
                        <select
                          className="h-9 rounded-lg border border-slate-200 px-2 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                          value={state.role}
                          onChange={(e) =>
                            setEditStates((prev) => ({
                              ...prev,
                              [u.id]: { ...state, role: e.target.value as UserRole },
                            }))
                          }
                          disabled={isSelf}
                        >
                          <option value="user">user</option>
                          <option value="admin">admin</option>
                        </select>
                        <input
                          type="password"
                          className="h-9 rounded-lg border border-slate-200 px-2 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                          value={state.password}
                          placeholder="留空则不改密码"
                          onChange={(e) =>
                            setEditStates((prev) => ({
                              ...prev,
                              [u.id]: { ...state, password: e.target.value },
                            }))
                          }
                        />
                        <div className="flex items-center text-sm text-slate-500">{new Date(u.created_at).toLocaleDateString()}</div>
                        <button
                          type="button"
                          className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-200 px-2 text-slate-600 transition hover:bg-slate-50 hover:text-slate-800"
                          onClick={() => void saveUser(u.id)}
                        >
                          保存
                        </button>
                        <button
                          type="button"
                          className="inline-flex h-9 items-center justify-center gap-1 rounded-lg border border-red-200 px-2 text-red-500 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                          onClick={() => void removeUser(u.id)}
                          disabled={isSelf}
                        >
                          <Trash2 size={14} /> 删除
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        ) : (
          <div className="flex h-full min-h-0 flex-col">
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
        )}
      </div>
        </div>
      </div>
    </main>
  );
}
