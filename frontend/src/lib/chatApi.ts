import { getToken } from "./api";

const AGENT_BASE = "/agent";

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
