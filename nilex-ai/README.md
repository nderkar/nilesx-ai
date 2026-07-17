# Nilex AI — MCP Server, CLI, and Agent

Phases 2 and 3 of the Task Platform project: an [MCP](https://modelcontextprotocol.io) server that
exposes Phase 1's task/user/role operations as tools an LLM can call, a terminal CLI (`nilex`) built
on the exact same code, and a Claude-powered conversational Agent built on top of both. All three are
thin adapters over one shared **tool registry** (`src/registry.ts`) — see the glossary below if MCP
is new to you.

## Glossary (first AI/LLM project — start here)

- **Tool** — a named function with a description and an input schema. The LLM reads the description
  to decide *when* to call it, and the schema to know *what arguments* to pass. E.g. `start_task(taskId)`.
- **MCP server** — a process that hosts tools and executes them when asked. It has no intelligence —
  it's a dumb, reliable adapter. Ours just forwards every tool call to the Phase 1 REST API.
- **MCP client** — the "brain" driving the conversation: Claude Desktop, Claude Code, or our own Agent.
  It reads tool descriptions, decides which to call based on what the user asked, and turns results
  into a natural-language answer.
- **Transport** — how client and server talk. **stdio**: the client spawns the server as a local
  subprocess and speaks JSON-RPC over stdin/stdout (what Claude Desktop/Code use). **Streamable HTTP**:
  the server runs as a persistent network service multiple clients can connect to (what the Agent uses).
- **Tool-use loop** — how an LLM actually "does things": you send it a message plus a list of tool
  definitions; it replies asking to call one (or several); you execute them and send the results back;
  it either asks for more tools or gives a final answer. The Agent below automates this loop with the
  Claude API's *Tool Runner* instead of hand-writing it.
- **Session** — one connected client's state. Ours holds a JWT + logged-in user, obtained by calling
  the `login` tool. Nothing is authenticated until you call it.
- **Tool registry** — the one authoritative list of operations (`src/registry.ts`). MCP stdio, MCP
  HTTP, and the CLI are all just different ways of exposing this same list — add an operation once,
  get it everywhere.

## Architecture

```
Backend REST API (Phase 1, unchanged)
        ▲  HTTP + JWT
        │
   src/registry.ts   ← the tool registry: name, description, zod input schema, handler
        │
   ┌────┴─────────────────┬─────────────────────────────┐
   │                       │                             │
src/mcp/stdio.ts    src/mcp/http.ts ◄──────┐        src/cli/index.ts
(Claude Desktop/Code)  (network MCP)       │      (`nilex` terminal command)
                                            │ MCP client
                                     src/agent/agentSession.ts
                                     (Claude API tool-use loop)
                                            │
                              src/agent/server.ts   src/agent/repl.ts
                              (chat HTTP API,          (`nilex chat` —
                               for Phase 4's UI)      terminal chat now)
```

The Agent is a *fourth* kind of MCP client, alongside Claude Desktop, Claude Code, and (indirectly)
the CLI — it just happens to be one we wrote, using the regular Claude API instead of a pre-built
client app. Nothing about the MCP server changed to support it.

## Admin panel integration (governance)

Every process (stdio or HTTP) pushes its registry's metadata — name, description, category, required
roles — to the backend on startup (`POST /tool-settings/sync`, authenticated with a shared secret,
`TOOL_SYNC_KEY`, not a user JWT — there's no "acting user" for a service announcing its own tool list).
This keeps the backend's `ToolSetting` table an always-current mirror of `src/registry.ts` without
anyone hand-syncing two files.

The web dashboard's **Tool Registry** admin page reads that table and lets an ADMIN flip a tool's
`enabled` flag off — e.g. disable `delete_user` for AI/CLI access without touching code or affecting
the human web UI (which doesn't go through this check at all). Each session fetches the current
enabled/disabled map once, right after `login`, and caches it — so a toggle takes effect on a tool's
*next* login, not instantly mid-session. That's a deliberate tradeoff: it keeps every single tool call
from paying an extra network round trip just to check a flag.

Separately, every mutating request — from the web dashboard, the CLI, or an MCP tool call — carries an
`X-Nilex-Client` header (`web` if absent, `cli`, `mcp-stdio`, or `mcp-http`) and shows up in the
dashboard's **Activity Log** page, including denied attempts. One unified audit trail, because all
three front doors ultimately hit the same backend HTTP API.

## Setup

```sh
cd nilex-ai
npm install
cp .env.example .env   # TOOL_SYNC_KEY must match the backend's TOOL_SYNC_KEY exactly
npm run build
```

Requires the Phase 1 backend running at `http://localhost:4000` (override with `NILEX_API_URL`). The
`.env` is loaded automatically regardless of how the process is launched (npm script, global `nilex`
bin, or Claude Desktop spawning it directly) — see `src/lib/loadEnv.ts` if you're curious how.

## The tool registry (21 tools)

| Group | Tools |
|---|---|
| Session | `login`, `logout`, `whoami`, `login_with_token` (internal — see Phase 4 below) |
| Tasks | `list_my_tasks`, `list_all_tasks`, `get_task`, `get_task_history`, `create_task`, `update_task`, `assign_task`, `start_task`, `complete_task`, `delete_task` |
| Users | `list_users`, `create_user`, `update_user`, `delete_user` |
| Roles | `list_roles`, `create_role`, `update_role`, `delete_role` |

Every tool (except `login`/`logout`/`whoami`) requires calling `login` first in that session, and every
tool's actual permission (ADMIN/MANAGER/MEMBER) is enforced by the Phase 1 backend — the tool just
forwards whatever error the API returns.

## `node` vs `nilex` as the launch command

Two ways to start the same stdio MCP server, with different reliability tradeoffs:

| | `node <absolute path>` | `nilex mcp` |
|---|---|---|
| Requires | Nothing beyond Node installed | `npm link` run once, and `nilex` resolvable on **PATH** |
| Reliable from a GUI app (Claude Desktop) | ✅ always | ⚠️ GUI-launched processes don't reliably inherit your shell's PATH — can silently fail to find `nilex` |
| Reliable from a terminal tool (Claude Code) | ✅ | ✅ — Claude Code inherits your shell environment |
| Portability | Path is machine-specific | Same command works on any machine once linked |

**Rule of thumb: use `node` + absolute path for Claude Desktop, `nilex mcp` for Claude Code.**

## Using it with Claude Desktop

Edit Claude Desktop's config file:
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "nilex-ai": {
      "command": "node",
      "args": ["D:/LLM/MCPServer/nilex-ai/dist/mcp/stdio.js"]
    }
  }
}
```

Restart Claude Desktop. In a new chat, try:

> "Log me in as admin@example.com, password password123, then show me all open tasks."

Claude will call `login`, then `list_all_tasks`, and summarize the result. Since no identity is
attached until `login` runs, you'll need to say who you're logging in as at the start of each new
conversation (the session lives only as long as the spawned process — one per chat).

## Using it with Claude Code

```sh
claude mcp add nilex-ai -- nilex mcp
```

(Equivalent to `claude mcp add nilex-ai -- node D:/LLM/MCPServer/nilex-ai/dist/mcp/stdio.js` if you'd
rather not depend on `nilex` being linked — both launch the identical server.)

Then in a Claude Code session: `claude mcp list` to confirm it's registered, and just ask Claude to
use it ("using nilex-ai, log in as manager@example.com / password123 and list my tasks").

## Using the Streamable HTTP transport

```sh
npm run mcp:http    # listens on http://localhost:4100/mcp
```

Each new HTTP session gets its own isolated, unauthenticated identity (verified: two concurrent
clients never see each other's login). This is what the Agent (below) and Phase 4's Chat UI connect
to instead of spawning a subprocess per conversation.

## The Nilex Agent (Phase 3)

The Agent turns natural language into MCP tool calls using the Claude API. It is **its own MCP
client** — connecting to `src/mcp/http.ts` exactly like the test scripts in `src/mcp/test*.ts` do —
rather than using Claude's built-in remote-MCP connector (`mcp_servers` on `messages.create`). That
connector requires *Anthropic's* servers to reach your MCP server over the public internet; ours runs
on `localhost`, reachable only from this machine, so the Agent has to dial in itself.

**Setup**: `ANTHROPIC_API_KEY` in `.env`, plus the backend and `npm run mcp:http` both running.

```sh
npm run mcp:http        # in one terminal — the MCP server the Agent talks to
nilex chat               # in another — interactive terminal chat
```

```
you> log me in as admin@example.com, password password123
nilex> You're logged in as Alice Admin (ADMIN). What would you like to do?

you> create a task titled 'Draft Q3 board deck', assign it to Sam Member
nilex> Done! Created "Draft Q3 board deck" and assigned it to Sam Member. It's sitting in TODO.
```

Nothing is authenticated until you say who to log in as — same as a fresh Claude Desktop chat, since
it's the same session-based `login` tool underneath.

**As a service** (what the dashboard's chat widget — Phase 4, below — actually calls):

```sh
npm run agent:server     # listens on http://localhost:4200
```

```sh
# Auth header is optional — omit it to get the natural-language login flow,
# same as the REPL. The dashboard widget always sends it (see Phase 4).
curl -X POST http://localhost:4200/chat/sessions \
  -H "Authorization: Bearer <a Task Platform JWT from POST /auth/login>"
# => {"sessionId": "...", "authenticated": true}

curl -X POST http://localhost:4200/chat/sessions/<id>/messages \
  -H 'Content-Type: application/json' \
  -d '{"message": "what tasks do I have open?"}'
# => {"reply": "You don't have any open tasks right now..."}

# Streaming variant — one JSON object per line as Claude produces it,
# instead of waiting for the whole turn:
curl -N -X POST http://localhost:4200/chat/sessions/<id>/messages/stream \
  -H 'Content-Type: application/json' \
  -d '{"message": "what tasks do I have open?"}'
# => {"type":"tool_use","name":"list_my_tasks"}
#    {"type":"text_delta","text":"You"}
#    {"type":"text_delta","text":" don't have any open tasks..."}
#    {"type":"done"}

curl -X DELETE http://localhost:4200/chat/sessions/<id>
```

Each session is a separate `AgentSession` (`src/agent/agentSession.ts`) held in memory, keyed by ID —
same pattern as the MCP HTTP transport's own session map. Under the hood, each turn runs the Claude
API's **Tool Runner** (`client.beta.messages.toolRunner`) against tools converted straight from the
live MCP tool list via the SDK's built-in `mcpTools()` helper — model `claude-opus-4-8`, adaptive
thinking, `effort: "high"`. Conversation history — including every intermediate tool call — carries
forward automatically between turns. The streaming endpoint pulls events from a fresh
`BetaMessageStream` the Tool Runner yields each loop iteration (`for await` — pull-based, so there's
no risk of missing early events the way a `.on(...)` listener attached a tick late could).

Verify it yourself without any UI at all:

```sh
npm run test:agent   # scripted multi-turn conversation: login, query, create+assign, follow-up query
```

## Phase 4: the dashboard chat widget

The Task Platform frontend embeds a floating chat widget (`frontend/src/components/ChatWidget.tsx`)
talking to the Agent's HTTP service through a Vite proxy (`/agent` → `localhost:4200`, same pattern
as `/api` → the backend).

**No re-login inside the chat.** The widget already has your dashboard JWT (`localStorage`) — it
sends it as `Authorization: Bearer <token>` when creating the session, and the Agent uses the
`login_with_token` MCP tool to authenticate immediately, bypassing Claude's reasoning entirely (there's
no decision to make: you're already who you are). `login_with_token` is marked `essential` in the
registry, same as `login`/`logout`/`whoami` — it's plumbing, not an AI-invokable capability, so it's
never synced to the Admin panel's Tool Registry and can't be disabled from there.

**Streaming renders live**, including a "using `{tool}`..." indicator the instant Claude decides to
call something — driven by the same NDJSON protocol shown above, read via `fetch()` + a
`ReadableStream` reader (the browser's `EventSource` can't POST a body or send custom headers, so
formal SSE wouldn't have bought anything here).

**Session persistence**: the sessionId lives in `sessionStorage`, so navigating between dashboard
pages — or refreshing — keeps your conversation. If the Agent server has restarted since (in-memory
sessions don't survive that), the widget transparently starts a fresh, re-authenticated session and
retries the turn once, rather than surfacing a confusing error.

**Markdown rendering**: Claude's replies (bold, bullet lists) render through `react-markdown` rather
than showing raw asterisks — no `dangerouslySetInnerHTML` involved, so there's no XSS surface from
rendering LLM-generated text.

## Using the CLI

```sh
npm run build
npm link        # one-time: registers the global `nilex` command (uses package.json's "bin" field)
```

`npm link` creates a global symlink/shim so `nilex` resolves from any directory, just like any other
globally-installed CLI tool. Re-run `npm run build` after code changes — no need to re-link.

```sh
nilex login          # prompts for email + password, stores a token in ~/.nilex/
nilex whoami
nilex tasks list-my
nilex tasks list-all --status TODO
nilex tasks create --title "Ship the release notes" --assignee <userId>
nilex tasks start <taskId>
nilex tasks complete <taskId>
nilex tasks assign <taskId> --to <userId>
nilex tasks delete <taskId>
nilex users list
nilex roles list
nilex logout
```

Every command is a thin wrapper that looks up the tool by name in `src/registry.ts` and runs its
`handler` — same code path MCP uses, just printed to a terminal instead of returned as MCP content.

### Short forms

Every subcommand group and the most common actions have short aliases and short flags, so the above
compresses to:

```sh
nilex t la -s TODO              # tasks list-all --status TODO
nilex t lm                      # tasks list-my
nilex t new -t "Title" -a <id>  # tasks create --title ... --assignee ...
nilex t done <taskId>           # tasks complete <taskId>
nilex t rm <taskId>             # tasks delete <taskId>
nilex t assign <taskId> -t <id> # tasks assign <taskId> --to <id>
nilex u ls                      # users list
nilex r ls                      # roles list
```

Run `nilex --help` or `nilex tasks --help` any time to see every alias and flag.

## Verifying it yourself

```sh
npm run test:stdio   # spawns the server, does a real MCP handshake, calls several tools
npm run test:http    # starts nothing (start `npm run mcp:http` first), then connects and calls tools
npm run test:agent   # scripted multi-turn conversation through the real Claude API + MCP tools
```

## What's next

- **Phase 5+**: notifications, reporting, tests/CI, deployment — see the top-level `README.md`.
