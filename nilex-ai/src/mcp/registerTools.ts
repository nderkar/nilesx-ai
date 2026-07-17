import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registry } from "../registry.js";
import type { SessionContext } from "../lib/session.js";
import { isToolEnabled } from "../lib/toolSettings.js";

/** Adapts every entry in the shared registry into an MCP tool bound to one
 * session's auth state. This is the ONLY MCP-specific file involved in
 * exposing operations — the registry itself has no MCP knowledge at all. */
export function registerTools(server: McpServer, ctx: SessionContext) {
  for (const tool of registry) {
    server.registerTool(
      tool.name,
      { description: tool.description, inputSchema: tool.inputShape },
      async (args: unknown) => {
        if (!tool.essential && !isToolEnabled(ctx, tool.name)) {
          return {
            content: [{ type: "text" as const, text: `The '${tool.name}' tool has been disabled by an administrator.` }],
            isError: true,
          };
        }
        try {
          const result = await tool.handler(args, ctx);
          const text = typeof result === "string" ? result : JSON.stringify(result, null, 2);
          return { content: [{ type: "text" as const, text }] };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return { content: [{ type: "text" as const, text: message }], isError: true };
        }
      },
    );
  }
}
