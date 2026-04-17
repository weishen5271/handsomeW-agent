import { useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Pin,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import type { ChatMessage, ContextDoc, TokenUsage } from "../types/app";

type ContextPanelProps = {
  open: boolean;
  onToggle: () => void;
  tokenUsage: TokenUsage;
  messages: ChatMessage[];
  contextDocs: ContextDoc[];
  sessionId: string | null;
  onTogglePin: (msg: ChatMessage) => void;
  onUploadDoc: (file: File) => void;
  onRemoveDoc: (docId: number) => void;
};

/** Rough estimate: 1 token ~ 4 chars for English, ~2 chars for Chinese. */
function estimateContextTokens(messages: ChatMessage[]): number {
  let chars = 0;
  for (const m of messages) {
    chars += m.text.length;
  }
  return Math.round(chars / 3);
}

function formatTokenCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function UsageBar({ used, total }: { used: number; total: number }) {
  const pct = total > 0 ? Math.min((used / total) * 100, 100) : 0;
  const color =
    pct > 85 ? "bg-red-500" : pct > 60 ? "bg-amber-500" : "bg-blue-500";

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px] text-slate-500">
        <span>上下文使用量</span>
        <span>
          {formatTokenCount(used)} / {formatTokenCount(total)} tokens
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full transition-all duration-300 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function TokenStats({ usage }: { usage: TokenUsage }) {
  return (
    <div className="grid grid-cols-3 gap-2 text-center">
      <div className="rounded-lg bg-blue-50 px-2 py-1.5">
        <p className="text-[10px] font-semibold uppercase text-blue-400">输入</p>
        <p className="text-sm font-bold text-blue-600">
          {formatTokenCount(usage.prompt_tokens)}
        </p>
      </div>
      <div className="rounded-lg bg-emerald-50 px-2 py-1.5">
        <p className="text-[10px] font-semibold uppercase text-emerald-400">输出</p>
        <p className="text-sm font-bold text-emerald-600">
          {formatTokenCount(usage.completion_tokens)}
        </p>
      </div>
      <div className="rounded-lg bg-slate-50 px-2 py-1.5">
        <p className="text-[10px] font-semibold uppercase text-slate-400">合计</p>
        <p className="text-sm font-bold text-slate-700">
          {formatTokenCount(usage.total_tokens)}
        </p>
      </div>
    </div>
  );
}

export default function ContextPanel({
  open,
  onToggle,
  tokenUsage,
  messages,
  contextDocs,
  sessionId,
  onTogglePin,
  onUploadDoc,
  onRemoveDoc,
}: ContextPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pinnedMessages = messages.filter((m) => m.pinned);
  const estimatedContext = estimateContextTokens(messages);
  // Use a common 128k context window as default reference
  const contextWindowSize = 128_000;

  return (
    <div className="border-b border-slate-200">
      {/* Header toggle */}
      <button
        type="button"
        className="flex w-full items-center gap-2 px-4 py-3 text-left transition hover:bg-slate-50"
        onClick={onToggle}
      >
        {open ? (
          <ChevronDown size={14} className="text-slate-400" />
        ) : (
          <ChevronRight size={14} className="text-slate-400" />
        )}
        <span className="text-sm font-semibold text-slate-700">上下文管理</span>
        {pinnedMessages.length > 0 && (
          <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-600">
            {pinnedMessages.length} 固定
          </span>
        )}
        {contextDocs.length > 0 && (
          <span className="rounded-md bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-600">
            {contextDocs.length} 文档
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="space-y-4 px-4 pb-4">
              {/* Token usage */}
              <div className="space-y-2">
                <UsageBar used={estimatedContext} total={contextWindowSize} />
                {tokenUsage.total_tokens > 0 && (
                  <TokenStats usage={tokenUsage} />
                )}
              </div>

              {/* Pinned messages */}
              <div>
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  固定消息
                </p>
                {pinnedMessages.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-slate-200 px-3 py-2 text-center text-[11px] text-slate-400">
                    点击消息旁的图钉固定重要信息
                  </p>
                ) : (
                  <div className="max-h-32 space-y-1 overflow-y-auto">
                    {pinnedMessages.map((msg) => (
                      <div
                        key={msg.id}
                        className="flex items-start gap-2 rounded-lg bg-amber-50 px-2 py-1.5"
                      >
                        <Pin size={12} className="mt-0.5 shrink-0 text-amber-500" />
                        <p className="flex-1 truncate text-xs text-slate-600">
                          {msg.text.slice(0, 80)}
                          {msg.text.length > 80 ? "…" : ""}
                        </p>
                        <button
                          type="button"
                          className="shrink-0 text-slate-400 transition hover:text-red-500"
                          onClick={() => onTogglePin(msg)}
                          title="取消固定"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Context documents */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    上下文文档
                  </p>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-600 transition hover:bg-blue-100"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={!sessionId}
                    title={sessionId ? "上传文档" : "请先创建会话"}
                  >
                    <Upload size={12} />
                    上传
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept=".txt,.md,.json,.csv,.log,.py,.js,.ts,.java,.xml,.yaml,.yml"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        onUploadDoc(file);
                        e.target.value = "";
                      }
                    }}
                  />
                </div>
                {contextDocs.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-slate-200 px-3 py-2 text-center text-[11px] text-slate-400">
                    上传文档作为临时知识库注入对话
                  </p>
                ) : (
                  <div className="max-h-28 space-y-1 overflow-y-auto">
                    {contextDocs.map((doc) => (
                      <div
                        key={doc.id}
                        className="flex items-center gap-2 rounded-lg bg-slate-50 px-2 py-1.5"
                      >
                        <FileText size={12} className="shrink-0 text-blue-500" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium text-slate-600">
                            {doc.file_name}
                          </p>
                          <p className="text-[10px] text-slate-400">
                            {doc.char_count.toLocaleString()} 字符
                          </p>
                        </div>
                        <button
                          type="button"
                          className="shrink-0 text-slate-400 transition hover:text-red-500"
                          onClick={() => onRemoveDoc(doc.id)}
                          title="删除文档"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
