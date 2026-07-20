import { useEffect, useRef, useState, type FormEvent } from "react";
import ReactMarkdown from "react-markdown";
import {
  ChatSessionNotFoundError,
  clearStoredChatSession,
  createChatSession,
  deleteChatSession,
  getStoredChatSession,
  storeChatSession,
  streamChatMessage,
  type AgentStreamEvent,
} from "../lib/chatApi";
import { useAuth } from "../lib/auth";
import { IconMessageCircle, IconSend, IconTool, IconX } from "./icons";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  pending?: boolean;
  isError?: boolean;
}

function newId(): string {
  return crypto.randomUUID();
}

export function ChatWidget() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [currentTool, setCurrentTool] = useState<string | null>(null);

  // auth.tsx already discards any session belonging to a different user
  // before login/logout swaps this component's identity in, so whatever's
  // in storage at mount time is guaranteed to already be ours (or empty).
  const sessionIdRef = useRef<string | null>(getStoredChatSession()?.sessionId ?? null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, currentTool]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  async function ensureSession(): Promise<string> {
    if (sessionIdRef.current) return sessionIdRef.current;
    const { sessionId } = await createChatSession();
    sessionIdRef.current = sessionId;
    storeChatSession(sessionId, user?.id ?? null);
    return sessionId;
  }

  function applyEvent(event: AgentStreamEvent, assistantId: string) {
    if (event.type === "text_delta") {
      setCurrentTool(null);
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantId ? { ...m, text: m.text + event.text } : m)),
      );
    } else if (event.type === "tool_use") {
      setCurrentTool(event.name);
    } else if (event.type === "done") {
      setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, pending: false } : m)));
    } else if (event.type === "error") {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId ? { ...m, text: event.message, pending: false, isError: true } : m,
        ),
      );
    }
  }

  async function send(userText: string) {
    const assistantId = newId();
    setMessages((prev) => [
      ...prev,
      { id: newId(), role: "user", text: userText },
      { id: assistantId, role: "assistant", text: "", pending: true },
    ]);
    setSending(true);
    setCurrentTool(null);

    try {
      let sessionId = await ensureSession();
      let retriedAfterExpiry = false;

      while (true) {
        try {
          for await (const event of streamChatMessage(sessionId, userText)) {
            applyEvent(event, assistantId);
          }
          break;
        } catch (err) {
          // The Agent server keeps sessions in memory only — a restart (or
          // just enough idle time) loses them. Transparently start a fresh,
          // re-authenticated session and retry this turn once rather than
          // surfacing a confusing "session not found" to the user.
          if (err instanceof ChatSessionNotFoundError && !retriedAfterExpiry) {
            retriedAfterExpiry = true;
            clearStoredChatSession();
            sessionIdRef.current = null;
            sessionId = await ensureSession();
            continue;
          }
          throw err;
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantId ? { ...m, text: message, pending: false, isError: true } : m)),
      );
    } finally {
      setSending(false);
      setCurrentTool(null);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    send(text);
  }

  async function handleNewChat() {
    if (sessionIdRef.current) {
      await deleteChatSession(sessionIdRef.current);
    }
    sessionIdRef.current = null;
    clearStoredChatSession();
    setMessages([]);
    setCurrentTool(null);
  }

  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 transition-transform hover:scale-105 hover:bg-indigo-500"
        aria-label={open ? "Close Nilex AI chat" : "Open Nilex AI chat"}
      >
        {open ? <IconX className="h-6 w-6" /> : <IconMessageCircle className="h-6 w-6" />}
      </button>

      {/* Always mounted (not conditionally rendered) so open/close can
          transition — the panel grows up from the launcher button instead of
          just appearing. Closed state is opacity/scale/translate down to
          zero plus pointer-events-none + aria-hidden, so it's inert without
          needing to unmount and lose scroll position/focus. */}
      <div
        aria-hidden={!open}
        style={{ transformOrigin: "bottom right" }}
        className={`fixed bottom-24 right-6 z-50 flex h-[32rem] w-96 max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl transition-all duration-300 ease-out dark:border-slate-700 dark:bg-slate-900 ${
          open
            ? "pointer-events-auto translate-y-0 scale-100 opacity-100"
            : "pointer-events-none translate-y-6 scale-95 opacity-0"
        }`}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">Nilex AI</p>
            <p className="text-xs text-slate-400">Ask about your tasks, in plain English</p>
          </div>
          <button
            onClick={handleNewChat}
            className="rounded-md px-2 py-1 text-xs font-medium text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
            title="Start a new conversation"
          >
            New chat
          </button>
        </div>

        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
          {messages.length === 0 && (
            <p className="mt-6 text-center text-sm text-slate-400">
              Try: <span className="italic">"what's on my plate?"</span> or{" "}
              <span className="italic">"create a task to review the budget"</span>
            </p>
          )}

          {messages.map((m) => (
            <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                  m.role === "user"
                    ? "bg-indigo-600 text-white"
                    : m.isError
                      ? "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400"
                      : "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100"
                }`}
              >
                {m.role === "assistant" ? (
                  <div className="prose-chat [&_p]:mb-1.5 [&_p:last-child]:mb-0 [&_ul]:my-1.5 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-4 [&_li]:mb-0.5 [&_strong]:font-semibold [&_code]:rounded [&_code]:bg-black/5 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs dark:[&_code]:bg-white/10">
                    <ReactMarkdown>{m.text || (m.pending ? "..." : "")}</ReactMarkdown>
                  </div>
                ) : (
                  m.text
                )}
              </div>
            </div>
          ))}

          {currentTool && (
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <IconTool className="h-3.5 w-3.5 animate-pulse" />
              using {currentTool}...
            </div>
          )}
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex items-center gap-2 border-t border-slate-100 p-3 dark:border-slate-800"
        >
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Message Nilex AI..."
            disabled={sending}
            className="flex-1 rounded-full border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-900 shadow-sm outline-none transition-all duration-150 placeholder:text-slate-400 hover:border-slate-300 focus:border-indigo-300 focus:ring-4 focus:ring-indigo-500/10 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-500 dark:hover:border-slate-600 dark:focus:border-indigo-400 dark:focus:ring-indigo-400/10"
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white transition-colors hover:bg-indigo-500 disabled:opacity-40"
            aria-label="Send"
          >
            <IconSend className="h-4 w-4" />
          </button>
        </form>
      </div>
    </>
  );
}
