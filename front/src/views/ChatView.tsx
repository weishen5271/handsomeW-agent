import { useMemo } from "react";
import type { RefObject } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Bot, Image, Loader2, Plus, Send, User } from "lucide-react";
import type { AgentSession, ChatMessage, StreamState } from "../types/app";

type ChatViewProps = {
  chatRef: RefObject<HTMLDivElement>;
  messages: ChatMessage[];
  draft: string;
  input: string;
  sessionList: AgentSession[];
  chatSessionId: string | null;
  sessionsLoading: boolean;
  sessionsError: string;
  streamState: StreamState;
  onInputChange: (value: string) => void;
  onSend: () => void | Promise<void>;
  onCreateSession: () => void | Promise<void>;
  onSwitchSession: (sessionId: string) => void | Promise<void>;
  onArchive: () => void;
  formatSessionTime: (isoText: string | null) => string;
  buildSessionTitle: (session: AgentSession, index: number) => string;
};

export default function ChatView({
  chatRef,
  messages,
  draft,
  input,
  sessionList,
  chatSessionId,
  sessionsLoading,
  sessionsError,
  streamState,
  onInputChange,
  onSend,
  onCreateSession,
  onSwitchSession,
  onArchive,
  formatSessionTime,
  buildSessionTitle,
}: ChatViewProps) {
  const messageItems = useMemo(() => messages, [messages]);

  return (
    <div className="flex h-full min-h-0 flex-col lg:flex-row">
      <div className="flex min-h-0 flex-1 flex-col">
        <section ref={chatRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-[var(--color-surface-raised)] p-6">
          <AnimatePresence initial={false}>
            {messageItems.map((msg) => {
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
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-white">
                      <Bot size={16} />
                    </div>
                  )}
                  <div
                    className={`max-w-[82%] rounded-2xl border px-4 py-3 ${
                      isUser
                        ? "border-primary bg-primary text-white"
                        : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]"
                    }`}
                    style={{ boxShadow: 'var(--color-shadow-layer)' }}
                  >
                    {msg.text && <p className="whitespace-pre-wrap leading-[1.6] tracking-tight">{msg.text}</p>}
                    {msg.imageUrl && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.96 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.22 }}
                        className="mt-2 overflow-hidden rounded-2xl border border-[var(--color-border)]"
                      >
                        <img src={msg.imageUrl} alt="生成图像" className="h-auto w-full object-cover" />
                      </motion.div>
                    )}
                    <p className={`mt-2 text-[11px] font-medium tracking-widest ${isUser ? "text-white/70" : "text-[var(--color-text-weak)]"}`}>
                      {msg.timestamp}
                    </p>
                  </div>
                  {isUser && (
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[rgba(27,97,201,0.1)] text-primary">
                      <User size={16} />
                    </div>
                  )}
                </motion.article>
              );
            })}
          </AnimatePresence>

          {draft && (
            <motion.article initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-white">
                <Bot size={16} />
              </div>
              <div className="max-w-[82%] rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-[var(--color-text)]" style={{ boxShadow: 'var(--color-shadow-layer)' }}>
                <p className="whitespace-pre-wrap leading-[1.6] tracking-tight">{draft}</p>
              </div>
            </motion.article>
          )}

          {streamState.loading && streamState.label && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-white">
                <Loader2 size={16} className="animate-spin" />
              </div>
              <div className="inline-flex items-center gap-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-[var(--color-text)]" style={{ boxShadow: 'var(--color-shadow-layer)' }}>
                <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
                <p className="leading-[1.6] tracking-tight">{streamState.label}</p>
              </div>
            </motion.div>
          )}
        </section>

        <footer className="border-t border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <div className="card rounded-3xl p-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="btn-secondary flex h-10 w-10 items-center justify-center"
                title="上传图像"
              >
                <Image size={18} />
              </button>
              <input
                className="input h-10 flex-1 text-[16px]"
                placeholder="输入你的问题，按回车发送"
                value={input}
                onChange={(e) => onInputChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void onSend();
                  }
                }}
              />
              <button
                type="button"
                className="btn-primary flex h-10 w-10 items-center justify-center"
                onClick={() => void onSend()}
                disabled={streamState.loading}
                title="发送消息"
              >
                <Send size={18} />
              </button>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between px-1 text-[11px] font-medium tracking-widest text-[var(--color-text-weak)]">
            <div className="space-y-1">
              <p>版权所有 2026 Lumina 智能系统</p>
              <p>由 React Agent 流式接口驱动</p>
            </div>
            <button className="text-[var(--color-text-weak)] transition hover:text-primary" type="button" onClick={onArchive}>
              存档
            </button>
          </div>
        </footer>
      </div>

      <aside className="flex h-72 shrink-0 flex-col border-t border-[var(--color-border)] bg-[var(--color-surface)] lg:h-auto lg:w-80 lg:border-l lg:border-t-0">
        <div className="border-b border-[var(--color-border)] p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-[var(--color-text)]">会话历史</p>
            <span className="rounded-lg bg-[var(--color-surface-raised)] px-2 py-0.5 text-[11px] font-semibold text-[var(--color-text-weak)]">
              {sessionList.length}
            </span>
          </div>
          <button
            type="button"
            className="btn-primary inline-flex w-full items-center justify-center gap-2"
            onClick={() => void onCreateSession()}
            disabled={streamState.loading}
          >
            <Plus size={14} /> 新建会话
          </button>
          {sessionsError && <p className="mt-2 text-xs text-red-500">{sessionsError}</p>}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {sessionsLoading ? (
            <div className="inline-flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3 py-2 text-xs text-[var(--color-text-weak)]">
              <Loader2 size={12} className="animate-spin text-primary" />
              加载会话中...
            </div>
          ) : !sessionList.length ? (
            <p className="rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3 py-5 text-center text-xs text-[var(--color-text-weak)]">
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
                        ? "border-primary bg-[rgba(27,97,201,0.1)]"
                        : "border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-text-weak)]"
                    }`}
                    onClick={() => void onSwitchSession(session.id)}
                    disabled={streamState.loading}
                  >
                    <p className={`truncate text-sm font-semibold ${active ? "text-primary" : "text-[var(--color-text)]"}`}>
                      {buildSessionTitle(session, index)}
                    </p>
                    <p className="mt-1 text-xs text-[var(--color-text-weak)]">{formatSessionTime(session.last_message_at ?? session.created_at)}</p>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
