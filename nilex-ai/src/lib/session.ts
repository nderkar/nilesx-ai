export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

/** Which front door this session came through. Sent as the X-Nilex-Client
 * header on every backend request so the Admin panel's Activity Log can show
 * "who did what, from where" instead of everything looking like the web app. */
export type ClientLabel = "cli" | "mcp-stdio" | "mcp-http";

/** Mutable, per-connection auth state. One of these lives for the life of one
 * MCP session (stdio process, or one HTTP session) — never shared across users. */
export interface SessionContext {
  token: string | null;
  user: SessionUser | null;
  clientLabel: ClientLabel;
  /** Cached name -> enabled map, fetched once right after login (see
   * lib/toolSettings.ts). Null until then; a session that never logs in
   * never needs it since every non-essential tool requires auth first anyway. */
  toolSettings: Record<string, boolean> | null;
}

export function createSession(clientLabel: ClientLabel): SessionContext {
  return { token: null, user: null, clientLabel, toolSettings: null };
}

export function requireAuth(
  ctx: SessionContext,
): asserts ctx is SessionContext & { token: string; user: SessionUser } {
  if (!ctx.token || !ctx.user) {
    throw new Error("Not logged in. Call the 'login' tool with your email and password first.");
  }
}
