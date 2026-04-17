import { create } from "zustand";
import type { DigitalAsset } from "../components/DigitalAssetsPanel";
import { TOKEN_KEY } from "../config";
import type {
  AgentSession,
  AuthUser,
  ChatMessage,
  ContextDoc,
  SkillShopItem,
  StreamState,
  ThinkingStep,
  TokenUsage,
  UserSkillConfig,
} from "../types/app";

type AuthState = {
  token: string;
  currentUser: AuthUser | null;
  bootLoading: boolean;
};

type ChatState = {
  messages: ChatMessage[];
  chatSessionId: string | null;
  sessionList: AgentSession[];
  sessionsLoading: boolean;
  sessionsError: string;
  input: string;
  draft: string;
  streamState: StreamState;
  thinkingSteps: ThinkingStep[];
  tokenUsage: TokenUsage;
  contextDocs: ContextDoc[];
  contextPanelOpen: boolean;
};

type UserManagementState = {
  users: AuthUser[];
  usersLoading: boolean;
  usersError: string;
  usersPage: number;
  usersPageSize: number;
  usersTotal: number;
};

type LlmState = {
  llmProvider: string;
  llmModel: string;
  llmBaseUrl: string;
  llmApiKey: string;
  llmApiKeySet: boolean;
  llmSkills: UserSkillConfig[];
  skillShopItems: SkillShopItem[];
  addingSkillName: string;
  deletingSkillName: string;
  llmLoading: boolean;
  llmSaving: boolean;
  llmError: string;
  llmSuccess: string;
};

type UiState = {
  userMenuOpen: boolean;
  selectedAsset: DigitalAsset | null;
};

type AppStore = {
  auth: AuthState;
  chat: ChatState;
  userManagement: UserManagementState;
  llm: LlmState;
  ui: UiState;
  setAuthState: (partial: Partial<AuthState>) => void;
  setChatState: (partial: Partial<ChatState>) => void;
  setUserManagementState: (partial: Partial<UserManagementState>) => void;
  setLlmState: (partial: Partial<LlmState>) => void;
  setUiState: (partial: Partial<UiState>) => void;
  clearAuthSession: () => void;
  resetChatState: () => void;
};

const initialAuthState = (): AuthState => ({
  token: localStorage.getItem(TOKEN_KEY) ?? "",
  currentUser: null,
  bootLoading: Boolean(localStorage.getItem(TOKEN_KEY)),
});

const initialChatState = (): ChatState => ({
  messages: [],
  chatSessionId: null,
  sessionList: [],
  sessionsLoading: false,
  sessionsError: "",
  input: "",
  draft: "",
  streamState: { loading: false, label: null },
  thinkingSteps: [],
  tokenUsage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  contextDocs: [],
  contextPanelOpen: false,
});

const initialUserManagementState = (): UserManagementState => ({
  users: [],
  usersLoading: false,
  usersError: "",
  usersPage: 1,
  usersPageSize: 10,
  usersTotal: 0,
});

const initialLlmState = (): LlmState => ({
  llmProvider: "openai",
  llmModel: "gpt-4o-mini",
  llmBaseUrl: "https://api.openai.com/v1",
  llmApiKey: "",
  llmApiKeySet: false,
  llmSkills: [],
  skillShopItems: [],
  addingSkillName: "",
  deletingSkillName: "",
  llmLoading: false,
  llmSaving: false,
  llmError: "",
  llmSuccess: "",
});

const initialUiState = (): UiState => ({
  userMenuOpen: false,
  selectedAsset: null,
});

export const useAppStore = create<AppStore>((set) => ({
  auth: initialAuthState(),
  chat: initialChatState(),
  userManagement: initialUserManagementState(),
  llm: initialLlmState(),
  ui: initialUiState(),
  setAuthState: (partial) => set((state) => ({ auth: { ...state.auth, ...partial } })),
  setChatState: (partial) => set((state) => ({ chat: { ...state.chat, ...partial } })),
  setUserManagementState: (partial) =>
    set((state) => ({ userManagement: { ...state.userManagement, ...partial } })),
  setLlmState: (partial) => set((state) => ({ llm: { ...state.llm, ...partial } })),
  setUiState: (partial) => set((state) => ({ ui: { ...state.ui, ...partial } })),
  resetChatState: () => set({ chat: initialChatState() }),
  clearAuthSession: () =>
    set({
      auth: { token: "", currentUser: null, bootLoading: false },
      chat: initialChatState(),
      userManagement: initialUserManagementState(),
      llm: initialLlmState(),
      ui: initialUiState(),
    }),
}));
