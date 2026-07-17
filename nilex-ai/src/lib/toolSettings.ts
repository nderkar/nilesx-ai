import { registry } from "../registry.js";
import type { SessionContext } from "./session.js";

// Read lazily inside each function, not as module-level consts — see the
// comment in lib/loadEnv.ts for why that matters here.
function getApiUrl(): string {
  return process.env.NILEX_API_URL ?? "http://localhost:4000";
}

/** Pushes this process's registry (minus the essential session tools) to the
 * backend so the Admin panel's Tool Registry page always reflects what this
 * server can actually do — call once at startup. Best-effort: a backend
 * that's down or misconfigured shouldn't stop the MCP server from serving
 * tools, it just means the Admin panel won't show them yet. */
export async function syncCatalog(): Promise<void> {
  const syncKey = process.env.TOOL_SYNC_KEY;
  if (!syncKey) {
    console.error("[nilex-ai] TOOL_SYNC_KEY not set — skipping catalog sync with the Admin panel.");
    return;
  }

  const tools = registry
    .filter((t) => !t.essential)
    .map((t) => ({
      name: t.name,
      description: t.description,
      category: t.category,
      requiredRoles: t.requiredRoles,
    }));

  try {
    const res = await fetch(`${getApiUrl()}/tool-settings/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-sync-key": syncKey },
      body: JSON.stringify({ tools }),
    });
    if (!res.ok) {
      console.error(`[nilex-ai] Catalog sync failed: HTTP ${res.status}`);
      return;
    }
    console.error(`[nilex-ai] Synced ${tools.length} tools with the Admin panel.`);
  } catch (err) {
    console.error("[nilex-ai] Catalog sync failed (backend unreachable):", err instanceof Error ? err.message : err);
  }
}

/** Fetches the current enabled/disabled state for every tool and caches it on
 * the session. Called once right after login — an admin toggling a tool
 * takes effect on the NEXT login, not instantly mid-session. That tradeoff
 * keeps every tool call from paying an extra network round trip. */
export async function refreshToolSettings(ctx: SessionContext): Promise<void> {
  if (!ctx.token) return;
  try {
    const res = await fetch(`${getApiUrl()}/tool-settings`, {
      headers: { Authorization: `Bearer ${ctx.token}`, "X-Nilex-Client": ctx.clientLabel },
    });
    if (!res.ok) return;
    const body = (await res.json()) as { tools: { name: string; enabled: boolean }[] };
    ctx.toolSettings = Object.fromEntries(body.tools.map((t) => [t.name, t.enabled]));
  } catch {
    // Non-fatal: if this fails, isToolEnabled() defaults everything to
    // enabled, so the session still works — it just can't be remotely
    // disabled until the next successful login.
  }
}

export function isToolEnabled(ctx: SessionContext, toolName: string): boolean {
  if (!ctx.toolSettings) return true;
  return ctx.toolSettings[toolName] !== false;
}
