import { randomUUID } from "node:crypto";
import express from "express";
import { AgentSession } from "./agentSession.js";
import { loadEnv } from "../lib/loadEnv.js";

loadEnv();

// The HTTP surface the dashboard's chat widget calls. Each conversation is
// one AgentSession, kept in memory and addressed by sessionId — same shape
// as the MCP HTTP transport's own session map in mcp/http.ts, for the same
// reason: one process, many concurrent conversations, each fully isolated.
const sessions = new Map<string, AgentSession>();

const app = express();
app.use(express.json());

function bearerToken(req: express.Request): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length);
}

app.post("/chat/sessions", async (req, res) => {
  const session = new AgentSession();
  const token = bearerToken(req);

  // Bridges an already-authenticated dashboard session straight into the
  // chat — no "log me in as..." message needed. See registry.ts's
  // `login_with_token` tool for why this bypasses Claude entirely.
  if (token) {
    try {
      await session.authenticateWithToken(token);
    } catch (err) {
      res.status(401).json({ error: err instanceof Error ? err.message : "Authentication failed" });
      return;
    }
  }

  const sessionId = randomUUID();
  sessions.set(sessionId, session);
  res.status(201).json({ sessionId, authenticated: Boolean(token) });
});

app.post("/chat/sessions/:id/messages", async (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) {
    res.status(404).json({ error: "Unknown session. POST /chat/sessions to create one." });
    return;
  }
  const { message } = req.body as { message?: string };
  if (!message || typeof message !== "string") {
    res.status(400).json({ error: "Body must include a 'message' string." });
    return;
  }
  try {
    const reply = await session.sendMessage(message);
    res.json({ reply });
  } catch (err) {
    console.error("Agent turn failed:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Agent turn failed" });
  }
});

// Streaming variant: one JSON object per line (newline-delimited JSON) over
// a plain chunked response — not formal Server-Sent Events, since the
// browser's EventSource can't POST a body or send an Authorization header
// anyway, so the frontend has to hand-read the stream either way. NDJSON is
// simpler to parse than SSE's "event:"/"data:" framing for that case.
app.post("/chat/sessions/:id/messages/stream", async (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) {
    res.status(404).json({ error: "Unknown session. POST /chat/sessions to create one." });
    return;
  }
  const { message } = req.body as { message?: string };
  if (!message || typeof message !== "string") {
    res.status(400).json({ error: "Body must include a 'message' string." });
    return;
  }

  res.setHeader("Content-Type", "application/x-ndjson");
  res.setHeader("Cache-Control", "no-cache");

  try {
    for await (const event of session.sendMessageStream(message)) {
      res.write(`${JSON.stringify(event)}\n`);
    }
  } catch (err) {
    console.error("Agent stream failed:", err);
    res.write(`${JSON.stringify({ type: "error", message: err instanceof Error ? err.message : "Agent turn failed" })}\n`);
  } finally {
    res.end();
  }
});

app.delete("/chat/sessions/:id", async (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) {
    res.status(404).json({ error: "Unknown session" });
    return;
  }
  await session.close();
  sessions.delete(req.params.id);
  res.status(204).send();
});

const port = Number(process.env.NILEX_AGENT_PORT ?? 4200);
app.listen(port, () => {
  console.log(`Nilex Agent chat service listening on http://localhost:${port}`);
});
