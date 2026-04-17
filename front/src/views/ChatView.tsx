import { useMemo } from "react";
import type { RefObject } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Bot, Image, Loader2, Pin, Plus, Send, User } from "lucide-react";
import type { AgentSession, ChatMessage, ContextDoc, StreamState, ThinkingStep, TokenUsage } from "../types/app";
import ThinkingPanel from "../components/ThinkingPanel";
import ContextPanel from "../components/ContextPanel";

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
  thinkingSteps: ThinkingStep[];
  tokenUsage: TokenUsage;
  contextDocs: ContextDoc[];
  contextPanelOpen: boolean;
  onToggleContextPanel: () => void;
  onTogglePin: (msg: ChatMessage) => void;
  onUploadDoc: (file: File) => void;
  onRemoveDoc: (docId: number) => void;
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
  thinkingSteps,
  tokenUsage,
  contextDocs,
  contextPanelOpen,
  onToggleContextPanel,
  onTogglePin,
  onUploadDoc,
  onRemoveDoc,
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
        <section ref={chatRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-slate-50/30 p-6">
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
                  className={`group flex items-start gap-3 ${isUser ? "justify-end" : "justify-start"}`}
                >
                  {!isUser && (
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white">
                      <Bot size={16} />
                    </div>
                  )}
                  <div className="relative max-w-[82%]">
                    <div
                      className={`rounded-2xl border border-slate-200 px-4 py-3 shadow-sm ${
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
                      <p className={`mt-2 text-[11px] font-bold tracking-widest ${isUser ? "text-blue-100" : "text-slate-400"}`}>
                        {msg.timestamp}
                      </p>
                    </div>
                    {/* Pin button — visible on hover or when already pinned */}
                    {msg.memoryId && (
                      <button
                        type="button"
                        className={`absolute -top-2 ${isUser ? "-left-3" : "-right-3"} flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white shadow-sm transition ${
                          msg.pinned
                            ? "text-amber-500"
                            : "text-slate-300 opacity-0 hover:text-amber-500 group-hover:opacity-100"
                        }`}
                        onClick={() => onTogglePin(msg)}
                        title={msg.pinned ? "取消固定" : "固定消息"}
                      >
                        <Pin size={12} />
                      </button>
                    )}
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

          {(thinkingSteps.length > 0 || streamState.loading) && (
            <ThinkingPanel steps={thinkingSteps} loading={streamState.loading} />
          )}

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
                className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-600 text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                onClick={() => void onSend()}
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
            <button className="text-slate-500 transition hover:text-blue-600" type="button" onClick={onArchive}>
              存档
            </button>
          </div>
        </footer>
      </div>

      <aside className="flex h-72 shrink-0 flex-col border-t border-slate-200 bg-white lg:h-auto lg:w-80 lg:border-l lg:border-t-0">
        {/* Context management panel */}
        <ContextPanel
          open={contextPanelOpen}
          onToggle={onToggleContextPanel}
          tokenUsage={tokenUsage}
          messages={messages}
          contextDocs={contextDocs}
          sessionId={chatSessionId}
          onTogglePin={onTogglePin}
          onUploadDoc={onUploadDoc}
          onRemoveDoc={onRemoveDoc}
        />

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
            onClick={() => void onCreateSession()}
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
                      active ? "border-blue-200 bg-blue-50" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                    }`}
                    onClick={() => void onSwitchSession(session.id)}
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
  );
}
