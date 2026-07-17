import { randomUUID } from "node:crypto";
import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { registerTools } from "./registerTools.js";
import { createSession } from "../lib/session.js";
import { syncCatalog } from "../lib/toolSettings.js";
import { loadEnv } from "../lib/loadEnv.js";

// Network-reachable version of the same MCP server. Unlike stdio (one process
// per client), many clients can connect here concurrently — so instead of one
// global session, we keep a map of sessionId -> its own transport, and each
// new session gets a *fresh*, unauthenticated SessionContext + McpServer.
// This is what the Nilex Agent (Phase 3) and other network clients will use.

loadEnv();

const app = express();
app.use(express.json());

const transports: Record<string, StreamableHTTPServerTransport> = {};

function buildServer() {
  const server = new McpServer({ name: "nilex-ai", version: "0.1.0" });
  const session = createSession("mcp-http");
  registerTools(server, session);
  return server;
}

app.post("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  try {
    let transport: StreamableHTTPServerTransport;

    if (sessionId && transports[sessionId]) {
      transport = transports[sessionId];
    } else if (!sessionId && isInitializeRequest(req.body)) {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid) => {
          transports[sid] = transport;
        },
      });
      transport.onclose = () => {
        const sid = transport.sessionId;
        if (sid) delete transports[sid];
      };

      const server = buildServer();
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      return;
    } else {
      res.status(400).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Bad Request: No valid session ID provided" },
        id: null,
      });
      return;
    }

    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("Error handling MCP request:", err);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
});

app.get("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (!sessionId || !transports[sessionId]) {
    res.status(400).send("Invalid or missing session ID");
    return;
  }
  await transports[sessionId].handleRequest(req, res);
});

app.delete("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (!sessionId || !transports[sessionId]) {
    res.status(400).send("Invalid or missing session ID");
    return;
  }
  await transports[sessionId].handleRequest(req, res);
});

await syncCatalog();

const port = Number(process.env.NILEX_MCP_PORT ?? 4100);
app.listen(port, () => {
  console.log(`Nilex AI MCP server (Streamable HTTP) listening on http://localhost:${port}/mcp`);
});
