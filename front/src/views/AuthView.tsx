import { Loader2, Sparkles } from "lucide-react";
import { useEffect } from "react";
import type { AuthMode } from "../types/app";
import { useAppStore } from "../stores/appStore";

type AuthViewProps = {
  authMode: AuthMode;
  authUsername: string;
  authPassword: string;
  authConfirm: string;
  authLoading: boolean;
  authError: string;
  onModeChange: (mode: AuthMode) => void;
  onUsernameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onConfirmChange: (value: string) => void;
  onSubmit: () => void | Promise<void>;
};

export default function AuthView({
  authMode,
  authUsername,
  authPassword,
  authConfirm,
  authLoading,
  authError,
  onModeChange,
  onUsernameChange,
  onPasswordChange,
  onConfirmChange,
  onSubmit,
}: AuthViewProps) {
  const { ui } = useAppStore();

  useEffect(() => {
    if (ui.theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [ui.theme]);

  return (
    <main className="min-h-screen bg-[var(--color-surface-raised)] px-4 py-6 text-[16px] font-medium">
      <div className="card mx-auto flex h-[calc(100vh-3rem)] w-full max-w-5xl items-center justify-center p-6">
        <div className="w-full max-w-md rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
          <div className="mb-6 flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-white" style={{ boxShadow: '0 4px 12px rgba(27, 97, 201, 0.3)' }}>
              <Sparkles size={18} />
            </span>
            <div>
              <h1 className="font-display text-2xl font-bold leading-tight text-[var(--color-text)]">TwinMind</h1>
              <p className="text-[11px] font-medium tracking-widest text-[var(--color-text-weak)]">用户登录中心</p>
            </div>
          </div>

          <div className="mb-4 grid grid-cols-2 gap-2 rounded-2xl bg-[var(--color-surface-raised)] p-1">
            <button
              type="button"
              className={`rounded-xl px-3 py-2 text-sm font-bold transition ${authMode === "login" ? "bg-[var(--color-surface)] text-primary shadow-sm" : "text-[var(--color-text-weak)]"}`}
              onClick={() => onModeChange("login")}
            >
              登录
            </button>
            <button
              type="button"
              className={`rounded-xl px-3 py-2 text-sm font-bold transition ${authMode === "register" ? "bg-[var(--color-surface)] text-primary shadow-sm" : "text-[var(--color-text-weak)]"}`}
              onClick={() => onModeChange("register")}
            >
              注册
            </button>
          </div>

          <div className="space-y-3">
            <input
              className="input"
              placeholder="用户名（3-32 位）"
              value={authUsername}
              onChange={(e) => onUsernameChange(e.target.value)}
            />
            <input
              type="password"
              className="input"
              placeholder="密码（至少 6 位）"
              value={authPassword}
              onChange={(e) => onPasswordChange(e.target.value)}
            />
            {authMode === "register" && (
              <input
                type="password"
                className="input"
                placeholder="确认密码"
                value={authConfirm}
                onChange={(e) => onConfirmChange(e.target.value)}
              />
            )}
          </div>

          {authError && <p className="mt-3 text-sm text-red-500">{authError}</p>}

          <button
            type="button"
            className="btn-primary mt-4 flex h-11 w-full items-center justify-center"
            disabled={authLoading}
            onClick={() => void onSubmit()}
          >
            {authLoading ? <Loader2 size={16} className="animate-spin" /> : authMode === "login" ? "立即登录" : "立即注册"}
          </button>
        </div>
      </div>
    </main>
  );
}
