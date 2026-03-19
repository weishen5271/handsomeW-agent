import { useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Bot, Image, Loader2, Send, Sparkles, User } from "lucide-react";

type ChatRole = "user" | "assistant";

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

const AGENT_API = "/agents/react/chat/stream";

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

export default function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streamState, setStreamState] = useState<StreamState>({ loading: false, label: null });
  const [draft, setDraft] = useState<string>("");
  const chatRef = useRef<HTMLDivElement>(null);

  const historyPayload = useMemo(
    () =>
      messages.map((m) => ({
        role: m.role,
        content: [m.text, m.imageUrl].filter(Boolean).join("\n"),
      })),
    [messages],
  );

  const scrollToBottom = () => {
    requestAnimationFrame(() => {
      if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
    });
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
    const blob = new Blob([JSON.stringify(messages, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `lumina-会话-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: content,
          history: historyPayload,
        }),
      });

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

  return (
    <main className="min-h-screen bg-luminaBg px-4 py-6 text-[16px] font-medium text-luminaText">
      <div className="mx-auto flex h-[calc(100vh-3rem)] w-full max-w-5xl flex-col rounded-3xl border border-black/5 bg-white/40 p-4 shadow-soft backdrop-blur-sm md:p-6">
        <header className="mb-4 flex items-center justify-between border-b border-black/5 pb-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-black text-white">
              <Sparkles size={18} />
            </span>
            <div>
              <h1 className="font-title text-2xl font-bold leading-tight">Lumina</h1>
              <p className="text-[11px] font-bold tracking-widest text-black/30">神经网络助手</p>
            </div>
          </div>
          <div className="flex gap-4 text-sm font-medium">
            <button
              className="text-black/60 transition hover:text-black"
              type="button"
              onClick={() => {
                setMessages([]);
                setDraft("");
                setStreamState({ loading: false, label: null });
              }}
            >
              重置会话
            </button>
            <button className="text-black/60 transition hover:text-black" type="button" onClick={handleArchive}>
              存档
            </button>
          </div>
        </header>

        <section ref={chatRef} className="flex-1 space-y-4 overflow-y-auto pr-1">
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
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black text-white">
                      <Bot size={16} />
                    </div>
                  )}
                  <div
                    className={`max-w-[82%] rounded-2xl border border-black/5 px-4 py-3 shadow-sm ${
                      isUser ? "bg-black/5" : "bg-white"
                    }`}
                  >
                    {msg.text && <p className="whitespace-pre-wrap leading-[1.6]">{msg.text}</p>}
                    {msg.imageUrl && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.96 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.22 }}
                        className="mt-2 overflow-hidden rounded-2xl border border-black/5"
                      >
                        <img src={msg.imageUrl} alt="生成图像" className="h-auto w-full object-cover" />
                      </motion.div>
                    )}
                    <p className="mt-2 text-[11px] font-bold tracking-widest text-black/30">{msg.timestamp}</p>
                  </div>
                  {isUser && (
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black/10 text-black">
                      <User size={16} />
                    </div>
                  )}
                </motion.article>
              );
            })}
          </AnimatePresence>

          {draft && (
            <motion.article
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-start gap-3"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black text-white">
                <Bot size={16} />
              </div>
              <div className="max-w-[82%] rounded-2xl border border-black/5 bg-white px-4 py-3 shadow-sm">
                <p className="whitespace-pre-wrap leading-[1.6]">{draft}</p>
              </div>
            </motion.article>
          )}

          {streamState.loading && streamState.label && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-3"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-black text-white">
                <Loader2 size={16} className="animate-spin" />
              </div>
              <div className="inline-flex items-center gap-2 rounded-2xl border border-black/5 bg-white px-4 py-3 shadow-sm">
                <span className="h-2 w-2 animate-pulse rounded-full bg-black/50" />
                <p className="leading-[1.6]">{streamState.label}</p>
              </div>
            </motion.div>
          )}
        </section>

        <footer className="mt-4">
          <div className="rounded-3xl border border-black/10 bg-white/80 p-3 shadow-soft backdrop-blur-[12px]">
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="flex h-10 w-10 items-center justify-center rounded-2xl border border-black/10 bg-white text-black/70 transition hover:text-black"
                title="上传图像"
              >
                <Image size={18} />
              </button>
              <input
                className="h-10 flex-1 rounded-2xl border border-black/10 bg-white/70 px-4 text-[16px] font-medium leading-[1.6] text-[#111111] outline-none transition-colors duration-200 placeholder:text-black/35 focus:border-black/30"
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
                className="flex h-10 w-10 items-center justify-center rounded-2xl bg-black text-white transition hover:bg-black/85 disabled:cursor-not-allowed disabled:bg-black/40"
                onClick={() => void sendMessage()}
                disabled={streamState.loading}
                title="发送消息"
              >
                <Send size={18} />
              </button>
            </div>
          </div>
          <div className="mt-3 space-y-1 px-1 text-[11px] font-bold tracking-widest text-black/30">
            <p>版权所有 2026 Lumina 智能系统</p>
            <p>由 React Agent 流式接口驱动</p>
          </div>
        </footer>
      </div>
    </main>
  );
}
