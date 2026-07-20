import Anthropic from "@anthropic-ai/sdk";
import { mcpTools, type MCPClientLike, type MCPCallToolResultLike } from "@anthropic-ai/sdk/helpers/beta/mcp";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

/**
 * THE AGENT.
 *
 * One AgentSession = one conversation. It is an MCP client (same SDK, same
 * pattern as testHttpClient.ts) connected to nilex-ai's own Streamable HTTP
 * MCP server — the exact server Claude Desktop/Code use, just reached over
 * the network instead of spawned as a subprocess. On top of that it runs a
 * Claude API tool-use loop (the SDK's Tool Runner) so a natural-language
 * message can turn into one or more MCP tool calls before Claude replies.
 *
 * Why not Claude's *native* remote-MCP connector (`mcp_servers` on
 * `messages.create`)? That requires Anthropic's own servers to reach your
 * MCP server over the public internet. Ours runs on localhost — reachable
 * from this process, not from Anthropic's — so the agent has to be its own
 * MCP client instead, exactly like nilex-ai/src/mcp/testHttpClient.ts.
 *
 * Auth is unchanged from Claude Desktop/Code: a fresh session is logged out
 * until the `login` tool is called, so a new conversation starts with "log
 * me in as ...".
 */

const SYSTEM_PROMPT = `You are Nilex AI, the assistant for a small task-management platform.

You act on behalf of whoever you're chatting with, using the tools available to you to look up and
manage tasks, users, and roles. If 'login'/'logout' tools are available to you, nothing is authenticated
until you call 'login' — if any other tool fails because you're not logged in, ask for an email and
password and log in with them. Never repeat a password back in your reply, and don't log it. If
'login'/'logout' tools are NOT available to you, this conversation is authenticated as the current
dashboard user for its entire lifetime — you cannot log this user in, out, or in as someone else from
here, full stop. If a tool ever reports you're not authenticated in that case, tell the user their
dashboard session may need refreshing and to try again from the dashboard; never ask for credentials or
imply you can fix it yourself.

Keep replies short and conversational. After taking an action (creating, assigning, starting,
completing, or deleting a task; managing a user or role), confirm what happened in a sentence or two
instead of dumping raw tool output. When listing tasks or users, summarize them readably (e.g. a
short bulleted list) rather than pasting JSON.`;

let anthropicClient: Anthropic | null = null;

// Lazy singleton: constructed on first use, not at module load, so it reads
// ANTHROPIC_API_KEY only after loadEnv() has had a chance to load .env — see
// lib/loadEnv.ts for why module-level env reads are a foot-gun here.
function getAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    anthropicClient = new Anthropic();
  }
  return anthropicClient;
}

function getMcpUrl(): string {
  return process.env.NILEX_MCP_URL ?? "http://localhost:4100/mcp";
}

export type AgentStreamEvent =
  | { type: "text_delta"; text: string }
  | { type: "tool_use"; name: string }
  | { type: "done" }
  | { type: "error"; message: string };

export class AgentSession {
  private mcpClient: Client;
  private mcpClientAdapter!: MCPClientLike;
  private rawTools: Awaited<ReturnType<Client["listTools"]>>["tools"] = [];
  private tools: ReturnType<typeof mcpTools> = [];
  private messages: Anthropic.Beta.Messages.BetaMessageParam[] = [];
  private ready: Promise<void>;
  private bridged = false;

  constructor() {
    this.mcpClient = new Client({ name: "nilex-agent", version: "0.1.0" });
    this.ready = this.init();
  }

  private async init(): Promise<void> {
    const transport = new StreamableHTTPClientTransport(new URL(getMcpUrl()));
    await this.mcpClient.connect(transport);
    const { tools } = await this.mcpClient.listTools();
    this.rawTools = tools;

    // The MCP SDK's Client.callTool() return type is a broader union (it
    // includes a legacy shape without `content`) than the Anthropic SDK
    // helper's MCPClientLike expects. This thin adapter narrows it — the
    // Streamable HTTP transport we use only ever returns the modern
    // `{content: [...]}` shape at runtime, so the cast is safe.
    this.mcpClientAdapter = {
      callTool: (params) => this.mcpClient.callTool(params) as Promise<MCPCallToolResultLike>,
    };
    this.rebuildTools();
  }

  /** `login_with_token` is a programmatic bridge only (see
   * authenticateWithToken) — never something the LLM should decide to call
   * itself, regardless of session type. Once a session HAS been bridged that
   * way, `login` AND `logout` become off-limits too: identity for a bridged
   * session is owned entirely by the dashboard now, not by this
   * conversation. If `logout` stayed available, "log me out" mid-chat would
   * clear this session's auth with no way back in (this.bridged never
   * resets), stranding the conversation even though the dashboard session
   * is still perfectly valid — the fix for that dead end is to never let
   * the chat sever what it can't re-establish itself. */
  private rebuildTools(): void {
    const excluded = new Set([
      "login_with_token",
      ...(this.bridged ? ["login", "logout"] : []),
    ]);
    const visible = this.rawTools.filter((t) => !excluded.has(t.name));
    this.tools = mcpTools(visible, this.mcpClientAdapter);
  }

  /** Authenticates this session using a JWT the caller already has (e.g. the
   * dashboard's own login) instead of the natural-language "log me in as..."
   * flow — calls the `login_with_token` MCP tool directly, bypassing Claude
   * entirely, since there's no decision for the LLM to make here. */
  async authenticateWithToken(token: string): Promise<void> {
    await this.ready;
    const result = await this.mcpClient.callTool({
      name: "login_with_token",
      arguments: { token },
    });
    if (result.isError) {
      const text = Array.isArray(result.content) ? result.content[0] : undefined;
      const message = text && "text" in text ? text.text : "Authentication failed";
      throw new Error(message);
    }
    this.bridged = true;
    this.rebuildTools();
  }

  /** Sends one user turn through the full tool-use loop and returns Claude's
   * final text reply. Conversation history (including every intermediate
   * tool_use/tool_result exchange) carries forward to the next call. */
  async sendMessage(userText: string): Promise<string> {
    await this.ready;
    this.messages.push({ role: "user", content: userText });

    const runner = getAnthropicClient().beta.messages.toolRunner({
      model: "claude-opus-4-8",
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      thinking: { type: "adaptive" },
      output_config: { effort: "high" },
      tools: this.tools,
      messages: this.messages,
      max_iterations: 10,
    });

    const final = await runner;
    // The runner appends every intermediate turn (assistant tool_use, user
    // tool_result, ..., final assistant reply) onto its own params.messages
    // as it loops — snapshot that as our new history instead of manually
    // reconstructing it.
    this.messages = [...runner.params.messages];

    const text = final.content
      .filter((block): block is Anthropic.Beta.Messages.BetaTextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();

    return text || "(No text in that reply — it may have ended on a tool call.)";
  }

  /** Same tool-use loop as sendMessage(), but yields events as Claude
   * produces them instead of waiting for the whole turn to finish — text
   * token-by-token, plus a marker the moment a tool call is decided (from
   * `content_block_start`, before the tool's input has even finished
   * streaming in). Pull-based (`for await`) rather than `.on(...)`
   * listeners: the Tool Runner hands back a fresh, not-yet-consumed stream
   * each loop iteration, so pulling from it can't race a push-based
   * listener attached a tick late. */
  async *sendMessageStream(userText: string): AsyncGenerator<AgentStreamEvent> {
    await this.ready;
    this.messages.push({ role: "user", content: userText });

    const runner = getAnthropicClient().beta.messages.toolRunner({
      model: "claude-opus-4-8",
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      thinking: { type: "adaptive" },
      output_config: { effort: "high" },
      tools: this.tools,
      messages: this.messages,
      max_iterations: 10,
      stream: true,
    });

    try {
      for await (const messageStream of runner) {
        for await (const event of messageStream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            yield { type: "text_delta", text: event.delta.text };
          } else if (event.type === "content_block_start" && event.content_block.type === "tool_use") {
            yield { type: "tool_use", name: event.content_block.name };
          }
        }
      }
      this.messages = [...runner.params.messages];
      yield { type: "done" };
    } catch (err) {
      yield { type: "error", message: err instanceof Error ? err.message : String(err) };
    }
  }

  async close(): Promise<void> {
    await this.mcpClient.close();
  }
}
