import { Loader2, Sparkles } from "lucide-react";
import type { AuthMode } from "../types/app";

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
              onClick={() => onModeChange("login")}
            >
              登录
            </button>
            <button
              type="button"
              className={`rounded-xl px-3 py-2 text-sm font-bold transition ${
                authMode === "register" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500"
              }`}
              onClick={() => onModeChange("register")}
            >
              注册
            </button>
          </div>

          <div className="space-y-3">
            <input
              className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-[15px] text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
              placeholder="用户名（3-32 位）"
              value={authUsername}
              onChange={(e) => onUsernameChange(e.target.value)}
            />
            <input
              type="password"
              className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-[15px] text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
              placeholder="密码（至少 6 位）"
              value={authPassword}
              onChange={(e) => onPasswordChange(e.target.value)}
            />
            {authMode === "register" && (
              <input
                type="password"
                className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-[15px] text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                placeholder="确认密码"
                value={authConfirm}
                onChange={(e) => onConfirmChange(e.target.value)}
              />
            )}
          </div>

          {authError && <p className="mt-3 text-sm text-red-500">{authError}</p>}

          <button
            type="button"
            className="mt-4 flex h-11 w-full items-center justify-center rounded-2xl bg-blue-600 text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
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
