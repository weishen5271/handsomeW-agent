import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ChevronDown,
  Database,
  Image,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Package,
  Settings,
  Shield,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { API_BASE_URL, AGENT_API, SKILL_SHOP_PAGE_SIZE, TOKEN_KEY } from "./config";
import type { DigitalAsset } from "./components/DigitalAssetsPanel";
import { useAppStore } from "./stores/appStore";
import type {
  AgentMemory,
  AgentSession,
  AuthMode,
  AuthResponse,
  AuthUser,
  ChatMessage,
  SkillShopItem,
  SkillShopListResponse,
  UserLLMConfig,
  UserListResponse,
  UserRole,
  UserSkillConfig,
} from "./types/app";
import {
  cleanText,
  extractImageUrl,
  nowTag,
  parseBlocks,
  parseErrorDetail,
} from "./utils/app";
import AlarmsView from "./views/AlarmsView";
import AssetsView from "./views/AssetsView";
import AuthView from "./views/AuthView";
import ChatView from "./views/ChatView";
import DashboardView from "./views/DashboardView";
import LLMView from "./views/LLMView";
import LoadingView from "./views/LoadingView";
import ResourcesView from "./views/ResourcesView";
import Scene3DView from "./views/Scene3DView";
import ScenesView from "./views/ScenesView";
import StatusView from "./views/StatusView";
import UsersView from "./views/UsersView";

type NavItem = {
  path: string;
  title: string;
  label: string;
  icon: LucideIcon;
  adminOnly?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { path: "/", title: "系统概览", label: "仪表盘", icon: LayoutDashboard },
  { path: "/chat", title: "RCA 助手", label: "RCA 助手", icon: MessageSquare },
  { path: "/assets", title: "数字资产", label: "数字资产", icon: Database },
  { path: "/resources", title: "资源管理", label: "资源管理", icon: Package },
  { path: "/scenes", title: "场景配置", label: "场景配置", icon: Image },
  { path: "/alarms", title: "告警中心", label: "告警中心", icon: ShieldAlert },
  { path: "/status", title: "系统状态", label: "系统状态", icon: Activity },
  { path: "/llm", title: "模型配置", label: "模型配置", icon: Settings },
  { path: "/users", title: "用户管理", label: "用户管理", icon: Shield, adminOnly: true },
];

function formatSessionTime(isoText: string | null) {
  if (!isoText) return "暂无消息";
  return new Date(isoText).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildSessionTitle(session: AgentSession, index: number) {
  const raw = (session.title ?? "").trim();
  return raw || `会话 ${index + 1}`;
}

function mapMemoryToMessage(memory: AgentMemory): ChatMessage | null {
  if (memory.role !== "user" && memory.role !== "assistant") return null;
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
}

function resolveTitle(pathname: string, isAdmin: boolean) {
  if (pathname === "/scene3d") return "模型漫游";
  const item = NAV_ITEMS.find((entry) => entry.path === pathname && (!entry.adminOnly || isAdmin));
  return item?.title ?? "TwinMind";
}

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const chatRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const {
    auth,
    chat,
    userManagement,
    llm,
    ui,
    setAuthState,
    setChatState,
    setUserManagementState,
    setLlmState,
    setUiState,
    clearAuthSession: resetAppState,
  } = useAppStore();

  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [authUsername, setAuthUsername] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authConfirm, setAuthConfirm] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");
  const skillShopRequestIdRef = useRef(0);

  const isAdmin = auth.currentUser?.role === "admin";
  const historyPayload = useMemo(
    () =>
      chat.messages.map((message) => ({
        role: message.role,
        content: [message.text, message.imageUrl].filter(Boolean).join("\n"),
      })),
    [chat.messages],
  );

  const scrollToBottom = () => {
    requestAnimationFrame(() => {
      if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
    });
  };

  const clearAuthSession = () => {
    localStorage.removeItem(TOKEN_KEY);
    resetAppState();
  };

  const setAuthSession = (authResponse: AuthResponse) => {
    localStorage.setItem(TOKEN_KEY, authResponse.token);
    setAuthState({
      token: authResponse.token,
      currentUser: authResponse.user,
      bootLoading: false,
    });
  };

  const apiRequest = async <T,>(path: string, init: RequestInit = {}, withAuth = true): Promise<T> => {
    const headers = new Headers(init.headers ?? {});
    if (!headers.has("Content-Type") && init.body) headers.set("Content-Type", "application/json");
    if (withAuth && auth.token) headers.set("Authorization", `Bearer ${auth.token}`);

    const response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
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

    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  };

  const appendMessage = (role: "user" | "assistant", text: string) => {
    const imageUrl = extractImageUrl(text);
    const displayText = cleanText(text, imageUrl);
    const currentMessages = useAppStore.getState().chat.messages;
    const next: ChatMessage = {
      id: crypto.randomUUID(),
      role,
      text: displayText,
      imageUrl,
      timestamp: nowTag(),
    };
    setChatState({ messages: [...currentMessages, next] });
    scrollToBottom();
  };

  const fetchCurrentUser = async () => {
    if (!auth.token) {
      setAuthState({ bootLoading: false });
      return;
    }

    try {
      const me = await apiRequest<AuthUser>("/auth/me", { method: "GET" });
      setAuthState({ currentUser: me, bootLoading: false });
    } catch {
      clearAuthSession();
    }
  };

  const loadSessionMessages = async (sessionId: string) => {
    const memories = await apiRequest<AgentMemory[]>(`/agents/sessions/${sessionId}/messages?limit=500`, { method: "GET" });
    const restored = memories.map(mapMemoryToMessage).filter((item): item is ChatMessage => Boolean(item));
    setChatState({ messages: restored, chatSessionId: sessionId });
    scrollToBottom();
  };

  const fetchSessions = async (preferredSessionId?: string | null): Promise<string | null> => {
    if (!auth.token) return null;
    setChatState({ sessionsLoading: true, sessionsError: "" });

    try {
      const sessions = await apiRequest<AgentSession[]>("/agents/sessions?limit=50", { method: "GET" });
      setChatState({ sessionList: sessions, sessionsLoading: false });
      if (!sessions.length) return null;
      const target =
        preferredSessionId && sessions.some((session) => session.id === preferredSessionId)
          ? preferredSessionId
          : sessions[0].id;
      return target;
    } catch (error) {
      setChatState({
        sessionsLoading: false,
        sessionsError: error instanceof Error ? error.message : "加载会话历史失败",
      });
      return null;
    }
  };

  const createNewSession = async () => {
    if (chat.streamState.loading) return;
    setChatState({ sessionsError: "" });
    try {
      const created = await apiRequest<AgentSession>("/agents/sessions", { method: "POST" });
      setChatState({ chatSessionId: created.id, messages: [], draft: "", input: "" });
      const selectedId = await fetchSessions(created.id);
      if (selectedId && selectedId !== created.id) await loadSessionMessages(selectedId);
    } catch (error) {
      setChatState({ sessionsError: error instanceof Error ? error.message : "新建会话失败" });
    }
  };

  const switchSession = async (sessionId: string) => {
    if (chat.streamState.loading || sessionId === chat.chatSessionId) return;
    setChatState({ sessionsError: "", draft: "" });
    try {
      await loadSessionMessages(sessionId);
    } catch (error) {
      setChatState({ sessionsError: error instanceof Error ? error.message : "切换会话失败" });
    }
  };

  const fetchUsers = async (targetPage = userManagement.usersPage, targetPageSize = userManagement.usersPageSize) => {
    if (!isAdmin) return;
    setUserManagementState({ usersLoading: true, usersError: "" });

    try {
      const query = new URLSearchParams({
        page: String(targetPage),
        page_size: String(targetPageSize),
      });
      const data = await apiRequest<UserListResponse>(`/users?${query.toString()}`, { method: "GET" });
      const totalPages = Math.max(1, Math.ceil(data.total / targetPageSize));
      setUserManagementState({
        users: data.items,
        usersTotal: data.total,
        usersLoading: false,
        usersPage: targetPage > totalPages ? totalPages : targetPage,
      });
    } catch (error) {
      setUserManagementState({
        usersLoading: false,
        usersError: error instanceof Error ? error.message : "加载用户失败",
      });
    }
  };

  const fetchUserLlmConfig = async () => {
    try {
      const config = await apiRequest<UserLLMConfig | null>("/llm-config", { method: "GET" });
      if (!config) {
        setLlmState({
          llmProvider: "openai",
          llmModel: "gpt-4o-mini",
          llmBaseUrl: "https://api.openai.com/v1",
          llmApiKeySet: false,
        });
        return;
      }
      setLlmState({
        llmProvider: config.provider,
        llmModel: config.model,
        llmBaseUrl: config.base_url,
        llmApiKeySet: config.api_key_set,
      });
    } catch (error) {
      setLlmState({ llmError: error instanceof Error ? error.message : "加载模型配置失败" });
    }
  };

  const fetchUserSkillConfig = async () => {
    try {
      const skills = await apiRequest<UserSkillConfig[]>("/skill-config", { method: "GET" });
      setLlmState({ llmSkills: skills });
    } catch (error) {
      setLlmState({ llmError: error instanceof Error ? error.message : "加载 Skill 配置失败" });
    }
  };

  const fetchSkillShopItems = async (reset = false, keyword?: string): Promise<{ hasMore: boolean }> => {
    const q = (keyword ?? "").trim();
    const currentItems = useAppStore.getState().llm.skillShopItems;
    const nextPage = reset ? 1 : Math.floor(currentItems.length / SKILL_SHOP_PAGE_SIZE) + 1;
    const requestId = Date.now();
    skillShopRequestIdRef.current = requestId;

    try {
      const params = new URLSearchParams({
        page: String(nextPage),
        page_size: String(SKILL_SHOP_PAGE_SIZE),
      });
      if (q) params.set("q", q);

      const data = await apiRequest<SkillShopListResponse>(`/skill-shop?${params.toString()}`, { method: "GET" });
      if (skillShopRequestIdRef.current !== requestId) return { hasMore: false };
      setLlmState({
        skillShopItems: reset ? data.items : [...currentItems, ...data.items],
      });
      return { hasMore: data.has_more };
    } catch (error) {
      setLlmState({ llmError: error instanceof Error ? error.message : "加载 Skill 商店失败" });
      return { hasMore: false };
    }
  };

  const loadLlmAndSkillConfig = async () => {
    setLlmState({ llmLoading: true, llmError: "", llmSuccess: "" });
    try {
      await Promise.all([fetchUserLlmConfig(), fetchUserSkillConfig(), fetchSkillShopItems(true)]);
    } finally {
      setLlmState({ llmLoading: false });
    }
  };

  const addSkillToCurrentUser = async (shopItem: SkillShopItem) => {
    if (!shopItem.external_id.trim()) return;
    setLlmState({ addingSkillName: shopItem.external_id, llmError: "", llmSuccess: "" });
    try {
      await apiRequest<UserSkillConfig>("/skill-shop/add", {
        method: "POST",
        body: JSON.stringify({ external_id: shopItem.external_id, enabled: true }),
      });
      await Promise.all([fetchUserSkillConfig(), fetchSkillShopItems(true)]);
      setLlmState({ llmSuccess: `已加入 Skill：${shopItem.name}` });
    } catch (error) {
      setLlmState({ llmError: error instanceof Error ? error.message : "加入 Skill 失败" });
    } finally {
      setLlmState({ addingSkillName: "" });
    }
  };

  const removeSkillFromCurrentUser = async (skill: UserSkillConfig) => {
    const target = skill.name.trim();
    if (!target || !window.confirm(`确认删除 Skill「${target}」吗？`)) return;
    setLlmState({ deletingSkillName: target, llmError: "", llmSuccess: "" });
    try {
      await apiRequest<{ status: string }>(`/skill-config/${encodeURIComponent(target)}`, { method: "DELETE" });
      await Promise.all([fetchUserSkillConfig(), fetchSkillShopItems(true)]);
      setLlmState({ llmSuccess: `已删除 Skill：${target}` });
    } catch (error) {
      setLlmState({ llmError: error instanceof Error ? error.message : "删除 Skill 失败" });
    } finally {
      setLlmState({ deletingSkillName: "" });
    }
  };

  const submitAuth = async () => {
    const username = authUsername.trim();
    if (!username || !authPassword) {
      setAuthError("请输入用户名和密码");
      return;
    }
    if (authMode === "register" && authPassword !== authConfirm) {
      setAuthError("两次密码不一致");
      return;
    }

    setAuthLoading(true);
    setAuthError("");
    try {
      const endpoint = authMode === "login" ? "/auth/login" : "/auth/register";
      const authResponse = await apiRequest<AuthResponse>(
        endpoint,
        { method: "POST", body: JSON.stringify({ username, password: authPassword }) },
        false,
      );
      setAuthSession(authResponse);
      setAuthUsername("");
      setAuthPassword("");
      setAuthConfirm("");
      navigate("/");
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
      navigate("/");
    }
  };

  const sendMessage = async () => {
    const content = chat.input.trim();
    if (!content || chat.streamState.loading) return;

    appendMessage("user", content);
    setChatState({ input: "", draft: "", thinkingSteps: [], streamState: { loading: true, label: "正在思考" } });

    try {
      let resolvedSessionId = chat.chatSessionId;
      const response = await fetch(AGENT_API, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${auth.token}`,
        },
        body: JSON.stringify({
          input: content,
          session_id: chat.chatSessionId,
          history: historyPayload,
        }),
      });

      if (response.status === 401) {
        clearAuthSession();
        throw new Error("登录已过期，请重新登录");
      }
      if (!response.ok || !response.body) throw new Error("请求失败");

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
                setChatState({ chatSessionId: sid });
              }
            }
            if (event.eventType === "assistant") {
              const text = String(event.payload.content ?? "");
              if (text) {
                latestDraft = text;
                setChatState({ draft: text });
              }
            }
            if (event.eventType === "iteration_start") {
              const iter = Number(event.payload.iteration ?? 1);
              const step = {
                id: crypto.randomUUID(),
                type: "iteration" as const,
                status: "running" as const,
                iteration: iter,
                timestamp: Date.now(),
              };
              const prev = useAppStore.getState().chat.thinkingSteps;
              setChatState({ thinkingSteps: [...prev, step] });
            }
            if (event.eventType === "tool_call") {
              const toolCalls = event.payload.tool_calls as Array<{
                id: string;
                name: string;
                arguments: Record<string, unknown>;
              }> | undefined;
              const iter = Number(event.payload.iteration ?? 1);
              const rawText = JSON.stringify(toolCalls || "");
              if (rawText.toLowerCase().includes("image")) {
                setChatState({ streamState: { loading: true, label: "正在合成图像" } });
              }
              if (toolCalls) {
                const newSteps = toolCalls.map((tc) => ({
                  id: tc.id || crypto.randomUUID(),
                  type: "tool_call" as const,
                  status: "running" as const,
                  iteration: iter,
                  toolName: tc.name,
                  toolCallId: tc.id,
                  arguments: tc.arguments,
                  timestamp: Date.now(),
                }));
                const prev = useAppStore.getState().chat.thinkingSteps;
                setChatState({ thinkingSteps: [...prev, ...newSteps] });
              }
            }
            if (event.eventType === "tool_result") {
              const toolCallId = String(event.payload.tool_call_id ?? "");
              const resultStep = {
                id: crypto.randomUUID(),
                type: "tool_result" as const,
                status: (event.payload.is_error ? "error" : "done") as "error" | "done",
                iteration: Number(event.payload.iteration ?? 1),
                toolName: String(event.payload.tool_name ?? ""),
                toolCallId,
                content: String(event.payload.content ?? ""),
                isError: Boolean(event.payload.is_error),
                durationMs: event.payload.duration_ms as number | undefined,
                timestamp: Date.now(),
              };
              const prev = useAppStore.getState().chat.thinkingSteps;
              const updated = prev.map((s) =>
                s.type === "tool_call" && s.toolCallId === toolCallId
                  ? { ...s, status: resultStep.status }
                  : s,
              );
              setChatState({ thinkingSteps: [...updated, resultStep] });
            }
            if (event.eventType === "done") finalContent = String(event.payload.content ?? latestDraft ?? "");
            if (event.eventType === "error") {
              const msg = String(event.payload.message ?? "请求过程中出现错误");
              appendMessage("assistant", `发生错误：${msg}`);
              setChatState({ draft: "", streamState: { loading: false, label: null } });
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
      setChatState({ draft: "", streamState: { loading: false, label: null } });
      scrollToBottom();
    }
  };

  const createUserByAdmin = async (payload: { username: string; password: string; role: UserRole }) => {
    if (!payload.username.trim() || !payload.password) return;
    setUserManagementState({ usersError: "" });
    try {
      await apiRequest<AuthUser>("/users", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setUserManagementState({ usersPage: 1 });
      await fetchUsers(1, userManagement.usersPageSize);
    } catch (error) {
      setUserManagementState({ usersError: error instanceof Error ? error.message : "创建用户失败" });
    }
  };

  const saveUser = async (payload: { id: number; username: string; password: string; role: UserRole }) => {
    if (!payload.username.trim()) return;
    setUserManagementState({ usersError: "" });
    try {
      await apiRequest<AuthUser>(`/users/${payload.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          username: payload.username.trim(),
          role: payload.role,
          password: payload.password || undefined,
        }),
      });
      await fetchUsers(userManagement.usersPage, userManagement.usersPageSize);
    } catch (error) {
      setUserManagementState({ usersError: error instanceof Error ? error.message : "更新失败" });
    }
  };

  const removeUser = async (userId: number) => {
    setUserManagementState({ usersError: "" });
    try {
      await apiRequest<{ status: string }>(`/users/${userId}`, { method: "DELETE" });
      await fetchUsers(userManagement.usersPage, userManagement.usersPageSize);
    } catch (error) {
      setUserManagementState({ usersError: error instanceof Error ? error.message : "删除失败" });
    }
  };

  const saveLlmConfig = async () => {
    if (!llm.llmProvider.trim() || !llm.llmModel.trim() || !llm.llmBaseUrl.trim()) {
      setLlmState({ llmError: "请完整填写 Provider、模型和 Base URL" });
      return;
    }

    setLlmState({ llmSaving: true, llmError: "", llmSuccess: "" });
    try {
      const payload: Record<string, string> = {
        provider: llm.llmProvider.trim(),
        model: llm.llmModel.trim(),
        base_url: llm.llmBaseUrl.trim(),
      };
      if (llm.llmApiKey.trim()) payload.api_key = llm.llmApiKey.trim();

      const next = await apiRequest<UserLLMConfig>("/llm-config", {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      await apiRequest<UserSkillConfig[]>("/skill-config", {
        method: "PUT",
        body: JSON.stringify({
          skills: llm.llmSkills.map((skill) => ({ name: skill.name, enabled: skill.enabled })),
        }),
      });
      setLlmState({
        llmApiKeySet: next.api_key_set,
        llmApiKey: "",
        llmSuccess: "模型配置已保存",
        llmSaving: false,
      });
    } catch (error) {
      setLlmState({
        llmError: error instanceof Error ? error.message : "保存模型配置失败",
        llmSaving: false,
      });
    }
  };

  const handleArchive = () => {
    const blob = new Blob([JSON.stringify(chat.messages, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `lumina-会话-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    void fetchCurrentUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.token]);

  useEffect(() => {
    if (auth.token && auth.currentUser) {
      void (async () => {
        const targetSessionId = await fetchSessions(chat.chatSessionId);
        if (!targetSessionId) {
          setChatState({ chatSessionId: null, messages: [] });
          return;
        }
        await loadSessionMessages(targetSessionId);
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.token, auth.currentUser?.id]);

  useEffect(() => {
    if (location.pathname === "/users" && isAdmin) void fetchUsers();
    if (location.pathname === "/llm") void loadLlmAndSkillConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, isAdmin, userManagement.usersPage, userManagement.usersPageSize]);

  useEffect(() => {
    if (!ui.userMenuOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!userMenuRef.current?.contains(event.target as Node)) setUiState({ userMenuOpen: false });
    };
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") setUiState({ userMenuOpen: false });
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [ui.userMenuOpen, setUiState]);

  if (auth.bootLoading) return <LoadingView />;

  if (!auth.currentUser) {
    return (
      <AuthView
        authMode={authMode}
        authUsername={authUsername}
        authPassword={authPassword}
        authConfirm={authConfirm}
        authLoading={authLoading}
        authError={authError}
        onModeChange={setAuthMode}
        onUsernameChange={setAuthUsername}
        onPasswordChange={setAuthPassword}
        onConfirmChange={setAuthConfirm}
        onSubmit={submitAuth}
      />
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
            {NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin).map((item) => {
              const active = location.pathname === item.path;
              const Icon = item.icon;
              return (
                <button
                  key={item.path}
                  className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm transition-colors ${
                    active ? "bg-blue-50 font-semibold text-blue-600" : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                  }`}
                  type="button"
                  onClick={() => navigate(item.path)}
                >
                  <Icon size={18} /> {item.label}
                </button>
              );
            })}
          </nav>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <h2 className="font-title text-lg font-bold text-slate-800">{resolveTitle(location.pathname, isAdmin)}</h2>
            <div className="relative" ref={userMenuRef}>
              <button
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600 transition-colors hover:bg-slate-100"
                type="button"
                onClick={() => setUiState({ userMenuOpen: !ui.userMenuOpen })}
              >
                <Shield size={14} />
                {auth.currentUser.username} ({auth.currentUser.role})
                <ChevronDown size={14} className={`transition-transform ${ui.userMenuOpen ? "rotate-180" : ""}`} />
              </button>
              {ui.userMenuOpen && (
                <div className="absolute right-0 z-20 mt-2 w-44 overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
                  <button
                    className="inline-flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-100"
                    type="button"
                    onClick={() => {
                      setUiState({ userMenuOpen: false });
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
            <Routes>
              <Route path="/" element={<DashboardView />} />
              <Route path="/chat" element={<ChatView
                chatRef={chatRef}
                messages={chat.messages}
                draft={chat.draft}
                input={chat.input}
                sessionList={chat.sessionList}
                chatSessionId={chat.chatSessionId}
                sessionsLoading={chat.sessionsLoading}
                sessionsError={chat.sessionsError}
                streamState={chat.streamState}
                thinkingSteps={chat.thinkingSteps}
                onInputChange={(value) => setChatState({ input: value })}
                onSend={sendMessage}
                onCreateSession={createNewSession}
                onSwitchSession={switchSession}
                onArchive={handleArchive}
                formatSessionTime={formatSessionTime}
                buildSessionTitle={buildSessionTitle}
              />} />
              <Route path="/assets" element={<AssetsView apiBaseUrl={API_BASE_URL} token={auth.token} />} />
              <Route
                path="/resources"
                element={
                  <ResourcesView
                    apiBaseUrl={API_BASE_URL}
                    token={auth.token}
                    onPreviewModel={(asset: DigitalAsset) => {
                      setUiState({ selectedAsset: asset });
                      navigate("/scene3d");
                    }}
                  />
                }
              />
              <Route path="/scenes" element={<ScenesView apiBaseUrl={API_BASE_URL} token={auth.token} />} />
              <Route
                path="/scene3d"
                element={
                  <Scene3DView
                    apiBaseUrl={API_BASE_URL}
                    token={auth.token}
                    asset={ui.selectedAsset}
                    onBackToAssets={() => navigate("/assets")}
                  />
                }
              />
              <Route path="/alarms" element={<AlarmsView />} />
              <Route path="/status" element={<StatusView />} />
              <Route
                path="/llm"
                element={
                  <LLMView
                    llmProvider={llm.llmProvider}
                    llmModel={llm.llmModel}
                    llmBaseUrl={llm.llmBaseUrl}
                    llmApiKey={llm.llmApiKey}
                    llmApiKeySet={llm.llmApiKeySet}
                    llmSkills={llm.llmSkills}
                    skillShopItems={llm.skillShopItems}
                    addingSkillName={llm.addingSkillName}
                    deletingSkillName={llm.deletingSkillName}
                    llmLoading={llm.llmLoading}
                    llmSaving={llm.llmSaving}
                    llmError={llm.llmError}
                    llmSuccess={llm.llmSuccess}
                    onProviderChange={(value) => setLlmState({ llmProvider: value })}
                    onModelChange={(value) => setLlmState({ llmModel: value })}
                    onBaseUrlChange={(value) => setLlmState({ llmBaseUrl: value })}
                    onApiKeyChange={(value) => setLlmState({ llmApiKey: value })}
                    onSkillsChange={(skills) => setLlmState({ llmSkills: skills })}
                    onSave={saveLlmConfig}
                    onRefresh={(keyword, reset) => fetchSkillShopItems(Boolean(reset), keyword)}
                    onAddSkill={addSkillToCurrentUser}
                    onRemoveSkill={removeSkillFromCurrentUser}
                  />
                }
              />
              <Route
                path="/users"
                element={
                  isAdmin ? (
                    <UsersView
                      currentUser={auth.currentUser}
                      users={userManagement.users}
                      usersLoading={userManagement.usersLoading}
                      usersError={userManagement.usersError}
                      usersPage={userManagement.usersPage}
                      usersPageSize={userManagement.usersPageSize}
                      usersTotal={userManagement.usersTotal}
                      onClearError={() => setUserManagementState({ usersError: "" })}
                      onPageChange={(page) => setUserManagementState({ usersPage: page })}
                      onPageSizeChange={(size) => setUserManagementState({ usersPageSize: size })}
                      onCreateUser={createUserByAdmin}
                      onSaveUser={saveUser}
                      onRemoveUser={removeUser}
                    />
                  ) : (
                    <Navigate to="/" replace />
                  )
                }
              />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
        </div>
      </div>
    </main>
  );
}
