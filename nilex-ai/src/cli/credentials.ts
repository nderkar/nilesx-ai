import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { SessionUser } from "../lib/session.js";

const CRED_DIR = join(homedir(), ".nilex");
const CRED_PATH = join(CRED_DIR, "credentials.json");

interface StoredCredentials {
  token: string;
  user: SessionUser;
  /** Snapshot taken at login time — same "refreshes on next login" tradeoff
   * as the in-memory MCP session, so toggling a tool in the Admin panel
   * doesn't affect an already-logged-in CLI until you log in again. */
  toolSettings: Record<string, boolean> | null;
}

export function loadCredentials(): StoredCredentials | null {
  if (!existsSync(CRED_PATH)) return null;
  try {
    return JSON.parse(readFileSync(CRED_PATH, "utf8")) as StoredCredentials;
  } catch {
    return null;
  }
}

export function saveCredentials(creds: StoredCredentials): void {
  if (!existsSync(CRED_DIR)) mkdirSync(CRED_DIR, { recursive: true });
  writeFileSync(CRED_PATH, JSON.stringify(creds, null, 2), "utf8");
}

export function clearCredentials(): void {
  if (existsSync(CRED_PATH)) rmSync(CRED_PATH);
}
