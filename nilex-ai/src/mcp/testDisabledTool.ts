// Throwaway: proves a tool disabled in the Admin panel is refused by nilex-ai
// itself (client-side), not just by the backend. Run with:
//   node dist/mcp/testDisabledTool.js
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

async function main() {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["dist/mcp/stdio.js"],
  });
  const client = new Client({ name: "nilex-test-disabled", version: "0.1.0" });
  await client.connect(transport);

  await client.callTool({
    name: "login",
    arguments: { email: "admin@example.com", password: "password123" },
  });

  console.log("-- calling delete_user (currently disabled in the Admin panel) --");
  const result = await client.callTool({ name: "delete_user", arguments: { userId: "does-not-matter" } });
  console.log("isError:", result.isError);
  console.log("content:", result.content);

  await client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
