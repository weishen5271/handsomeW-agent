import { Loader2 } from "lucide-react";

export default function LoadingView() {
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
