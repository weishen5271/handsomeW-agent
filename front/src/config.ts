export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000").replace(/\/+$/, "");
export const AGENT_API = `${API_BASE_URL}/agents/react/chat/stream`;
export const TOKEN_KEY = "lumina_auth_token";
export const SKILL_SHOP_PAGE_SIZE = 12;
