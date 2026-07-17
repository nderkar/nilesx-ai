// Not part of the shipped product — a throwaway script to prove the stdio
// server actually speaks correct MCP over a real spawned subprocess, the
// same way Claude Desktop / Claude Code will talk to it. Run with:
//   npx tsx src/mcp/testStdioClient.ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

async function main() {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["dist/mcp/stdio.js"],
  });

  const client = new Client({ name: "nilex-test-client", version: "0.1.0" });
  await client.connect(transport);

  const tools = await client.listTools();
  console.log(`Discovered ${tools.tools.length} tools:`);
  console.log(tools.tools.map((t) => t.name).join(", "));

  console.log("\n-- calling whoami before login --");
  const whoBefore = await client.callTool({ name: "whoami", arguments: {} });
  console.log(whoBefore.content);

  console.log("\n-- calling login --");
  const login = await client.callTool({
    name: "login",
    arguments: { email: "admin@example.com", password: "password123" },
  });
  console.log(login.content);

  console.log("\n-- calling list_my_tasks after login --");
  const myTasks = await client.callTool({ name: "list_my_tasks", arguments: {} });
  console.log(myTasks.content);

  console.log("\n-- calling create_task then delete_task --");
  const created = await client.callTool({
    name: "create_task",
    arguments: { title: "MCP stdio smoke test task" },
  });
  console.log(created.content);
  const parsed = JSON.parse((created.content as any)[0].text);
  const taskId = parsed.task.id;

  const deleted = await client.callTool({ name: "delete_task", arguments: { taskId } });
  console.log(deleted.content);

  await client.close();
  console.log("\nAll good — closing.");
}

main().catch((err) => {
  console.error("Test client failed:", err);
  process.exit(1);
});
