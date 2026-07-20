import { getToken } from "./api";

const AGENT_BASE = "/agent";
const SESSION_KEY = "todo-platform-chat-session";
const SESSION_USER_KEY = "todo-platform-chat-session-user";

export interface ChatSession {
  sessionId: string;
  authenticated: boolean;
}

export type AgentStreamEvent =
  | { type: "text_delta"; text: string }
  | { type: "tool_use"; name: string }
  | { type: "done" }
  | { type: "error"; message: string };

/** Creates a new Agent conversation. Passes the dashboard's own JWT along —
 * the Agent uses it to auto-authenticate the chat session (see nilex-ai's
 * `login_with_token` tool), so the widget never has to ask you to log in
 * again inside the chat. */
export async function createChatSession(): Promise<ChatSession> {
  const token = getToken();
  const res = await fetch(`${AGENT_BASE}/chat/sessions`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `Failed to start chat: ${res.status}`);
  }
  return res.json() as Promise<ChatSession>;
}

export async function deleteChatSession(sessionId: string): Promise<void> {
  await fetch(`${AGENT_BASE}/chat/sessions/${sessionId}`, { method: "DELETE" }).catch(() => {
    // Best-effort cleanup — nothing the caller can do if this fails.
  });
}

/** The chat session persists in sessionStorage for the browser tab's
 * lifetime (see ChatWidget), tagged with the dashboard user it was bridged
 * for. These helpers are the only thing that touches those two keys, so the
 * "whose session is this" bookkeeping lives in one place. */
export function getStoredChatSession(): { sessionId: string; userId: string | null } | null {
  const sessionId = sessionStorage.getItem(SESSION_KEY);
  if (!sessionId) return null;
  return { sessionId, userId: sessionStorage.getItem(SESSION_USER_KEY) };
}

export function storeChatSession(sessionId: string, userId: string | null): void {
  sessionStorage.setItem(SESSION_KEY, sessionId);
  if (userId) sessionStorage.setItem(SESSION_USER_KEY, userId);
  else sessionStorage.removeItem(SESSION_USER_KEY);
}

export function clearStoredChatSession(): void {
  sessionStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(SESSION_USER_KEY);
}

/** Tears down any chat session left over from a different dashboard user (or
 * from being logged out) — same check covers both login-as-someone-else and
 * logout, since "no longer the same owner" is exactly what both have in
 * common. Best-effort: if the DELETE fails, the stale session just ages out
 * on the Agent server rather than blocking sign-in/sign-out on it. */
export async function discardChatSessionIfStale(currentUserId: string | null): Promise<void> {
  const stored = getStoredChatSession();
  if (!stored || stored.userId === currentUserId) return;
  await deleteChatSession(stored.sessionId);
  clearStoredChatSession();
}

/** Streams one turn as newline-delimited JSON events. The Agent's HTTP
 * service writes one JSON object per line as Claude produces it (not
 * formal Server-Sent Events — see nilex-ai/src/agent/server.ts for why);
 * this reads the fetch() body as a stream and re-assembles lines that land
 * split across chunk boundaries. */
export async function* streamChatMessage(
  sessionId: string,
  message: string,
): AsyncGenerator<AgentStreamEvent> {
  const res = await fetch(`${AGENT_BASE}/chat/sessions/${sessionId}/messages/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });

  if (res.status === 404) {
    throw new ChatSessionNotFoundError();
  }
  if (!res.ok || !res.body) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `Chat request failed: ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? ""; // last, possibly-incomplete line carries over
    for (const line of lines) {
      if (line.trim()) yield JSON.parse(line) as AgentStreamEvent;
    }
  }
  if (buffer.trim()) {
    yield JSON.parse(buffer) as AgentStreamEvent;
  }
}

export class ChatSessionNotFoundError extends Error {
  constructor() {
    super("Chat session no longer exists");
    this.name = "ChatSessionNotFoundError";
  }
}
