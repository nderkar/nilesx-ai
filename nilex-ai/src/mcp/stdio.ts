#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./registerTools.js";
import { createSession } from "../lib/session.js";
import { syncCatalog } from "../lib/toolSettings.js";
import { loadEnv } from "../lib/loadEnv.js";

// One process = one MCP session = one unauthenticated identity until the
// LLM calls the `login` tool. This is how Claude Desktop / Claude Code
// launch MCP servers: as a local subprocess talking JSON-RPC over stdin/stdout.
//
// stdout is reserved for JSON-RPC — syncCatalog()/console.error below log to
// stderr only, never stdout, or they'd corrupt the protocol stream.
loadEnv();
await syncCatalog();

const server = new McpServer({ name: "nilex-ai", version: "0.1.0" });
const session = createSession("mcp-stdio");
registerTools(server, session);

const transport = new StdioServerTransport();
await server.connect(transport);
