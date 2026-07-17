// Throwaway script proving the Streamable HTTP transport works end to end
// against a running `node dist/mcp/http.js`. Run with:
//   npx tsx src/mcp/testHttpClient.ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

async function main() {
  const transport = new StreamableHTTPClientTransport(new URL("http://localhost:4100/mcp"));
  const client = new Client({ name: "nilex-test-http-client", version: "0.1.0" });
  await client.connect(transport);

  const tools = await client.listTools();
  console.log(`Discovered ${tools.tools.length} tools over HTTP`);

  const login = await client.callTool({
    name: "login",
    arguments: { email: "manager@example.com", password: "password123" },
  });
  console.log("login:", login.content);

  const myTasks = await client.callTool({ name: "list_my_tasks", arguments: {} });
  console.log("list_my_tasks:", myTasks.content);

  await client.close();
  console.log("closed session cleanly.");
}

main().catch((err) => {
  console.error("HTTP test client failed:", err);
  process.exit(1);
});
