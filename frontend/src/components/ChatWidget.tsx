import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent } from "react";
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
import { useToast } from "./ToastProvider";
import { IconMessageCircle, IconMic, IconPlus, IconSend, IconTool, IconX } from "./icons";

const SpeechRecognitionCtor = window.SpeechRecognition ?? window.webkitSpeechRecognition;

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
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [currentTool, setCurrentTool] = useState<string | null>(null);
  const [listening, setListening] = useState(false);

  // auth.tsx already discards any session belonging to a different user
  // before login/logout swaps this component's identity in, so whatever's
  // in storage at mount time is guaranteed to already be ours (or empty).
  const sessionIdRef = useRef<string | null>(getStoredChatSession()?.sessionId ?? null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  // Whatever was already in the box when the current listening session
  // started — captured once per session so onresult can append to it
  // instead of overwriting it on every update.
  const baseTextRef = useRef("");

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, currentTool]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Auto-grow the textarea as you type multiple lines, capped at ~5 lines —
  // past that it scrolls internally instead of pushing the message list
  // (and the launcher button) further off-screen.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [input]);

  // Stop any in-progress recognition if the component ever unmounts —
  // ChatWidget is always-mounted in practice (see the open/close transition
  // below), but this guards against React StrictMode's double-invoke and
  // any future change to that assumption.
  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  // Fills the input as you speak rather than auto-sending on silence — a
  // misheard task title/ID going straight to the AI agent unreviewed is a
  // worse failure mode than one extra click, so this always leaves you a
  // chance to read and correct the transcript before hitting Send.
  function toggleListening() {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    if (!SpeechRecognitionCtor) return;

    // Snapshot whatever's already typed/transcribed so far — a second
    // listening session (stop, then start again) appends to it rather than
    // replacing it.
    baseTextRef.current = input.trim();

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = navigator.language || "en-US";
    recognition.interimResults = true;
    recognition.continuous = false;

    recognition.onresult = (event) => {
      let transcript = "";
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      const base = baseTextRef.current;
      setInput(base ? `${base} ${transcript}` : transcript);
    };
    recognition.onerror = () => {
      showToast("Couldn't hear you — try again", "error");
    };
    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
      inputRef.current?.focus();
    };

    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  }

  // Cancels any in-progress listening (without letting a straggling final
  // result resurrect the text right after clearing) and empties the box.
  function clearInput() {
    if (recognitionRef.current) {
      recognitionRef.current.onresult = null;
      recognitionRef.current.onend = null;
      recognitionRef.current.onerror = null;
      recognitionRef.current.abort();
      recognitionRef.current = null;
      setListening(false);
    }
    baseTextRef.current = "";
    setInput("");
    inputRef.current?.focus();
  }

  // File attachments aren't wired up to the backend yet — this just opens
  // the picker and lets the user know uploads are on the way, rather than
  // silently doing nothing when they pick a file.
  function handleFileChosen(e: ChangeEvent<HTMLInputElement>) {
    if (e.target.files?.length) {
      showToast("File uploads are coming soon");
    }
    e.target.value = "";
  }

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

  function submitMessage() {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    send(text);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    submitMessage();
  }

  // Enter sends, Shift+Enter inserts a newline (the standard chat-app
  // convention) — the textarea's default behavior on a bare Enter would
  // otherwise just insert a newline too, so that case is intercepted and
  // routed through the same submit path the form/button use.
  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submitMessage();
    }
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

        <form onSubmit={handleSubmit} className="border-t border-slate-100 p-3 dark:border-slate-800">
          <div className="flex min-h-18 w-full flex-col rounded-3xl border border-slate-200 bg-white px-3 pb-2 pt-2.5 shadow-sm transition-all duration-150 hover:border-slate-300 focus-within:border-indigo-300 focus-within:ring-4 focus-within:ring-indigo-500/10 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-slate-600 dark:focus-within:border-indigo-400 dark:focus-within:ring-indigo-400/10">
            <div className="relative">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Message Nilex AI... (Shift+Enter for a new line)"
                disabled={sending}
                rows={1}
                className="max-h-30 w-full resize-none overflow-y-auto bg-transparent pr-6 text-sm text-slate-900 outline-none placeholder:text-slate-400 disabled:opacity-60 dark:text-white dark:placeholder:text-slate-500"
              />
              {input && (
                <button
                  type="button"
                  onClick={clearInput}
                  className="absolute right-0 top-0 rounded-full p-0.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                  aria-label="Clear message"
                  title="Clear"
                >
                  <IconX className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <div className="mt-1 flex items-end justify-between">
              <div className="flex items-center gap-1">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,.pdf,.doc,.docx,.txt"
                  onChange={handleFileChosen}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={sending}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-700"
                  aria-label="Attach image or document"
                  title="Attach image or document"
                >
                  <IconPlus className="h-4 w-4" />
                </button>
                {SpeechRecognitionCtor && (
                  <button
                    type="button"
                    onClick={toggleListening}
                    disabled={sending}
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-40 ${
                      listening
                        ? "animate-pulse bg-red-500 text-white hover:bg-red-500"
                        : "text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
                    }`}
                    aria-label={listening ? "Stop voice input" : "Start voice input"}
                    title={listening ? "Stop voice input" : "Start voice input"}
                  >
                    <IconMic className="h-4 w-4" />
                  </button>
                )}
              </div>
              <button
                type="submit"
                disabled={sending || !input.trim()}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white transition-colors hover:bg-indigo-500 disabled:opacity-40"
                aria-label="Send"
              >
                <IconSend className="h-4 w-4" />
              </button>
            </div>
          </div>
        </form>
      </div>
    </>
  );
}
