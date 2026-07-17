#!/usr/bin/env node
import { Command } from "commander";
import { findTool } from "../registry.js";
import type { SessionContext } from "../lib/session.js";
import { isToolEnabled } from "../lib/toolSettings.js";
import { clearCredentials, loadCredentials, saveCredentials } from "./credentials.js";
import { prompt, promptPassword, readStdinLines } from "./prompt.js";
import { loadEnv } from "../lib/loadEnv.js";
import { printComments, printTaskDetail, printTasks } from "./render.js";

loadEnv();

// The CLI is the third front door onto the same tool registry MCP uses.
// Unlike MCP (one long-lived process per session), each CLI invocation is a
// fresh process — so the session token lives on disk (~/.nilex/credentials.json)
// between commands instead of in memory.

function sessionFromDisk(): SessionContext {
  const creds = loadCredentials();
  return {
    token: creds?.token ?? null,
    user: creds?.user ?? null,
    clientLabel: "cli",
    toolSettings: creds?.toolSettings ?? null,
  };
}

/** Runs a registry tool by name and prints the result. This is the one
 * place that adapts registry output to a terminal instead of MCP's
 * `content` array — proof the registry itself doesn't care who's asking. */
async function run(name: string, args: Record<string, unknown>) {
  const tool = findTool(name);
  if (!tool) {
    console.error(`Unknown tool: ${name}`);
    process.exitCode = 1;
    return;
  }
  const ctx = sessionFromDisk();
  if (!tool.essential && !isToolEnabled(ctx, tool.name)) {
    console.error(`The '${tool.name}' tool has been disabled by an administrator.`);
    process.exitCode = 1;
    return;
  }
  try {
    const result = await tool.handler(args, ctx);
    print(result);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  }
}

/** Like `run`, but hands the tool's result to a custom renderer instead of
 * the generic table/JSON printer — used for task/comment output that needs
 * color-coded priority/status/overdue formatting. */
async function runRendered<T>(name: string, args: Record<string, unknown>, render: (result: T) => void) {
  const tool = findTool(name);
  if (!tool) {
    console.error(`Unknown tool: ${name}`);
    process.exitCode = 1;
    return;
  }
  const ctx = sessionFromDisk();
  if (!tool.essential && !isToolEnabled(ctx, tool.name)) {
    console.error(`The '${tool.name}' tool has been disabled by an administrator.`);
    process.exitCode = 1;
    return;
  }
  try {
    const result = await tool.handler(args, ctx);
    render(result as T);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  }
}

function print(result: unknown) {
  if (Array.isArray(result)) {
    console.table(result);
    return;
  }
  if (result && typeof result === "object") {
    const values = Object.values(result as Record<string, unknown>);
    if (values.length === 1 && Array.isArray(values[0])) {
      console.table(values[0]);
      return;
    }
  }
  console.log(JSON.stringify(result, null, 2));
}

const program = new Command();
program.name("nilex").description("Nilex AI CLI — terminal access to the task platform").version("0.1.0");

program
  .command("login")
  .description("Log in and store credentials for future commands")
  .action(async () => {
    let email: string;
    let password: string;

    if (process.stdin.isTTY) {
      // Interactive terminal: readline reads the email line, fully closing
      // itself before promptPassword takes over stdin directly for masked
      // raw-keystroke entry — see prompt.ts for why these can't overlap.
      email = await prompt("Email: ");
      password = await promptPassword("Password: ");
    } else {
      // Piped/non-interactive: read both lines from stdin up front. See
      // readStdinLines' doc comment for why chaining two prompts here
      // doesn't work.
      process.stdout.write("Email: ");
      process.stdout.write("Password: ");
      [email, password] = await readStdinLines(2);
    }

    const ctx: SessionContext = { token: null, user: null, clientLabel: "cli", toolSettings: null };
    const tool = findTool("login")!;
    try {
      await tool.handler({ email, password }, ctx);
      saveCredentials({ token: ctx.token!, user: ctx.user!, toolSettings: ctx.toolSettings });
      console.log(`Logged in as ${ctx.user!.name} (${ctx.user!.role})`);
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    }
  });

program
  .command("logout")
  .description("Clear stored credentials")
  .action(() => {
    clearCredentials();
    console.log("Logged out.");
  });

program
  .command("whoami")
  .description("Show the currently logged-in user")
  .action(() => run("whoami", {}));

program
  .command("mcp")
  .description(
    "Start the MCP stdio server (for Claude Code / other terminal-launched MCP clients that " +
      "inherit your shell PATH). Claude Desktop is a GUI app and may not resolve `nilex` on PATH " +
      "reliably — prefer `node <absolute path to dist/mcp/stdio.js>` there instead.",
  )
  .action(async () => {
    // Dynamic import so this only runs (and only pulls in the MCP SDK) when
    // the `mcp` subcommand is actually invoked — every other `nilex` command
    // stays fast and MCP-SDK-free.
    await import("../mcp/stdio.js");
  });

program
  .command("chat")
  .description(
    "Chat with Nilex AI in plain English (Claude API + the same MCP tools Claude Desktop/Code use). " +
      "Requires the Nilex AI MCP HTTP server running (npm run mcp:http) and ANTHROPIC_API_KEY set.",
  )
  .action(async () => {
    await import("../agent/repl.js");
  });

const tasks = program.command("tasks").alias("t").description("Task operations");

// Accepts a bare "2026-08-01" as well as a full ISO timestamp, since typing
// a plain date is the natural thing to do at a terminal prompt but the
// backend's Zod schema requires a full ISO 8601 datetime string.
function normalizeDue(due: string | undefined): string | undefined {
  if (!due) return undefined;
  return /^\d{4}-\d{2}-\d{2}$/.test(due) ? `${due}T00:00:00.000Z` : due;
}

tasks
  .command("list-my")
  .alias("lm")
  .description("List tasks assigned to you")
  .action(() => runRendered("list_my_tasks", {}, (r: { tasks: Parameters<typeof printTasks>[0] }) => printTasks(r.tasks)));

tasks
  .command("list-all")
  .alias("la")
  .description("List every task (ADMIN/MANAGER only)")
  .option("-s, --status <status>", "Filter by status: TODO, IN_PROGRESS, COMPLETED")
  .option("-a, --assignee <userId>", "Filter by assignee user ID")
  .option("-p, --priority <priority>", "Filter by priority: HIGH, MEDIUM, LOW")
  .option("--overdue", "Only show tasks past their due date and not completed")
  .action((opts) =>
    runRendered(
      "list_all_tasks",
      { status: opts.status, assigneeId: opts.assignee, priority: opts.priority, overdue: opts.overdue },
      (r: { tasks: Parameters<typeof printTasks>[0] }) => printTasks(r.tasks),
    ),
  );

tasks
  .command("show <taskId>")
  .description("Show full details for a task, including timestamps and time taken")
  .action((taskId) => runRendered("get_task", { taskId }, (r: { task: Parameters<typeof printTaskDetail>[0] }) => printTaskDetail(r.task)));

tasks
  .command("create")
  .alias("new")
  .description("Create a task (ADMIN/MANAGER only)")
  .requiredOption("-t, --title <title>", "Task title")
  .option("-d, --description <description>", "Task description")
  .option("-a, --assignee <userId>", "User ID to assign to")
  .option("-p, --priority <priority>", "Priority: HIGH, MEDIUM, or LOW (default MEDIUM)")
  .option("--due <date>", "Due date, ISO 8601 (e.g. 2026-08-01T00:00:00.000Z)")
  .action((opts) =>
    run("create_task", {
      title: opts.title,
      description: opts.description,
      assigneeId: opts.assignee,
      priority: opts.priority,
      dueDate: normalizeDue(opts.due),
    }),
  );

tasks
  .command("update <taskId>")
  .description("Edit a task's priority and/or due date (ADMIN/MANAGER only)")
  .option("-p, --priority <priority>", "Priority: HIGH, MEDIUM, or LOW")
  .option("--due <date>", "Due date, ISO 8601")
  .action((taskId, opts) =>
    run("update_task", { taskId, priority: opts.priority, dueDate: normalizeDue(opts.due) }),
  );

tasks
  .command("start <taskId>")
  .description("Start a task (TODO -> IN_PROGRESS)")
  .action((taskId) => run("start_task", { taskId }));

tasks
  .command("complete <taskId>")
  .alias("done")
  .description("Complete a task")
  .action((taskId) => run("complete_task", { taskId }));

tasks
  .command("assign <taskId>")
  .description("Assign a task; omit -t/--to to unassign")
  .option("-t, --to <userId>", "User ID to assign to")
  .action((taskId, opts) => run("assign_task", { taskId, assigneeId: opts.to }));

tasks
  .command("delete <taskId>")
  .alias("rm")
  .description("Delete a task (ADMIN/MANAGER only)")
  .action((taskId) => run("delete_task", { taskId }));

tasks
  .command("comments <taskId>")
  .description("List the comment thread on a task")
  .action((taskId) => runRendered("list_comments", { taskId }, (r: { comments: Parameters<typeof printComments>[0] }) => printComments(r.comments)));

tasks
  .command("comment <taskId> <text>")
  .description("Add a comment to a task")
  .action((taskId, text) => run("add_comment", { taskId, body: text }));

const users = program.command("users").alias("u").description("User operations (ADMIN/MANAGER only)");

users
  .command("list")
  .alias("ls")
  .description("List all users")
  .action(() => run("list_users", {}));

const roles = program.command("roles").alias("r").description("Role operations (ADMIN only)");

roles
  .command("list")
  .alias("ls")
  .description("List all roles")
  .action(() => run("list_roles", {}));

program.parseAsync(process.argv);
