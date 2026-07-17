import type { SessionContext } from "./session.js";

interface RequestOptions {
  method?: string;
  body?: unknown;
}

// Read lazily (not a module-level const) so it reflects .env loaded by
// loadEnv() at process startup — module-level top-level code in every
// imported file runs before an entrypoint's own top-level code, so a
// module-scope `const API_URL = process.env...` would capture the value
// too early. See lib/loadEnv.ts for the full explanation.
function getApiUrl(): string {
  return process.env.NILEX_API_URL ?? "http://localhost:4000";
}

/** Every tool/CLI command funnels its backend call through here. This is the
 * only place that knows the API's base URL and how to attach the bearer token
 * — everything else (RBAC, validation) is enforced by the backend itself. */
export async function apiRequest<T>(
  ctx: SessionContext,
  path: string,
  { method = "GET", body }: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = { "X-Nilex-Client": ctx.clientLabel };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (ctx.token) headers.Authorization = `Bearer ${ctx.token}`;

  const res = await fetch(`${getApiUrl()}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) {
    return undefined as T;
  }

  if (!res.ok) {
    const parsed = (await res.json().catch(() => ({ error: res.statusText }))) as { error?: string };
    throw new Error(parsed.error ?? `Request failed: ${res.status}`);
  }

  return (await res.json()) as T;
}
