import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Loads nilex-ai/.env regardless of the current working directory or who
 * spawned this process (npm script, global `nilex` bin, or Claude Desktop
 * launching `node .../dist/mcp/stdio.js` directly with its own cwd).
 *
 * Resolved relative to THIS file's own location, not `process.cwd()` — so it
 * finds the right .env whether running from src/lib (tsx, dev) or dist/lib
 * (node, built), one level under the package root either way.
 *
 * Must be called before anything reads `process.env.*` — but note ES module
 * imports are fully evaluated before an importing file's own top-level code
 * runs, so modules that read env vars at import time (module-scope consts)
 * would see them too early no matter where this call appears textually.
 * That's why backendClient.ts / toolSettings.ts read `process.env` lazily,
 * inside function bodies, instead of caching it in a module-level constant.
 */
export function loadEnv(): void {
  const envPath = path.join(import.meta.dirname, "..", "..", ".env");
  if (existsSync(envPath)) {
    process.loadEnvFile(envPath);
  }
}
