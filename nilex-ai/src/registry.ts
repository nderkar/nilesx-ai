import { z } from "zod";
import { apiRequest } from "./lib/backendClient.js";
import { requireAuth, type SessionContext } from "./lib/session.js";
import { refreshToolSettings } from "./lib/toolSettings.js";

/**
 * THE TOOL REGISTRY.
 *
 * This is the single authoritative list of operations Nilex AI can perform.
 * It knows nothing about MCP, stdio, HTTP, or terminal commands — each entry
 * is just: a name, a description (read by the LLM to decide when to call it),
 * an input shape (zod schema, used for both validation AND for generating the
 * JSON Schema the LLM sees), and a handler that calls the Phase 1 backend API.
 *
 * Three different front doors (MCP stdio, MCP HTTP, and the `nilex` CLI) all
 * loop over this same array instead of re-implementing the operations three
 * times. Add a tool here once, and it's instantly available everywhere.
 *
 * `category` / `requiredRoles` are pushed to the backend on startup (see
 * lib/sync.ts) so the Admin panel's Tool Registry page always mirrors this
 * file without anyone hand-syncing two places. `essential` tools (login,
 * logout, whoami) are never synced and can never be disabled — you need at
 * least those three to be able to do anything at all.
 */

export interface ToolDef {
  name: string;
  description: string;
  category: "Session" | "Tasks" | "Users" | "Roles";
  requiredRoles?: string[]; // undefined = any authenticated identity
  essential?: boolean;
  inputShape: Record<string, z.ZodTypeAny>;
  handler: (args: any, ctx: SessionContext) => Promise<unknown>;
}

// Small helper purely for type inference: lets each entry below get a
// strongly-typed `args` parameter derived from its own `inputShape`, while
// the resulting array stays a single homogeneous ToolDef[].
function defineTool<Shape extends Record<string, z.ZodTypeAny>>(def: {
  name: string;
  description: string;
  category: ToolDef["category"];
  requiredRoles?: string[];
  essential?: boolean;
  inputShape: Shape;
  handler: (args: { [K in keyof Shape]: z.infer<Shape[K]> }, ctx: SessionContext) => Promise<unknown>;
}): ToolDef {
  return def as ToolDef;
}

const TASK_STATUS = z.enum(["TODO", "IN_PROGRESS", "COMPLETED"]);
const TASK_PRIORITY = z.enum(["HIGH", "MEDIUM", "LOW"]);
const ADMIN_MANAGER = ["ADMIN", "MANAGER"];

export const registry: ToolDef[] = [
  // ---- Auth / session -----------------------------------------------------
  defineTool({
    name: "login",
    description:
      "Log in to Nilex AI with an email and password. Must be called before any other tool " +
      "(except 'whoami' when already logged in). Returns the authenticated user's name and role.",
    category: "Session",
    essential: true,
    inputShape: {
      email: z.string().email().describe("Account email address"),
      password: z.string().min(1).describe("Account password"),
    },
    handler: async ({ email, password }, ctx) => {
      const res = await apiRequest<{ token: string; user: SessionContext["user"] }>(
        ctx,
        "/auth/login",
        { method: "POST", body: { email, password } },
      );
      ctx.token = res.token;
      ctx.user = res.user;
      await refreshToolSettings(ctx);
      return { message: `Logged in as ${res.user?.name} (${res.user?.role})`, user: res.user };
    },
  }),

  defineTool({
    name: "login_with_token",
    description:
      "(Internal — not for the LLM to call.) Authenticate this session using an existing JWT " +
      "instead of email/password. Used by the Nilex Agent to bridge an already-authenticated " +
      "dashboard session into a new chat, so the widget never has to ask for credentials again.",
    category: "Session",
    essential: true,
    inputShape: { token: z.string().min(1) },
    handler: async ({ token }, ctx) => {
      ctx.token = token;
      const res = await apiRequest<{
        user: { id: string; email: string; name: string; roleId: string; roleName: string };
      }>(ctx, "/auth/me");
      ctx.user = {
        id: res.user.id,
        email: res.user.email,
        name: res.user.name,
        role: res.user.roleName,
      };
      await refreshToolSettings(ctx);
      return { message: `Authenticated as ${ctx.user.name} (${ctx.user.role})`, user: ctx.user };
    },
  }),

  defineTool({
    name: "logout",
    description: "Clear the current login session.",
    category: "Session",
    essential: true,
    inputShape: {},
    handler: async (_args, ctx) => {
      const wasUser = ctx.user;
      ctx.token = null;
      ctx.user = null;
      ctx.toolSettings = null;
      return { message: wasUser ? `Logged out of ${wasUser.email}` : "Already logged out" };
    },
  }),

  defineTool({
    name: "whoami",
    description: "Show who is currently logged in and their role (ADMIN, MANAGER, or MEMBER).",
    category: "Session",
    essential: true,
    inputShape: {},
    handler: async (_args, ctx) => {
      if (!ctx.token || !ctx.user) {
        return { loggedIn: false, message: "Not logged in. Call the 'login' tool first." };
      }
      return { loggedIn: true, user: ctx.user };
    },
  }),

  // ---- Tasks ---------------------------------------------------------------
  defineTool({
    name: "list_my_tasks",
    description: "List tasks assigned to the currently logged-in user. Available to every role.",
    category: "Tasks",
    inputShape: {},
    handler: async (_args, ctx) => {
      requireAuth(ctx);
      return apiRequest(ctx, "/tasks/my");
    },
  }),

  defineTool({
    name: "list_all_tasks",
    description:
      "List every task across the whole team, optionally filtered by status, assignee, priority, or " +
      "overdue-ness. Only available to ADMIN and MANAGER — MEMBER users should use 'list_my_tasks' instead.",
    category: "Tasks",
    requiredRoles: ADMIN_MANAGER,
    inputShape: {
      status: TASK_STATUS.optional().describe("Filter by status"),
      assigneeId: z.string().optional().describe("Filter by assignee user ID"),
      priority: TASK_PRIORITY.optional().describe("Filter by priority"),
      overdue: z.boolean().optional().describe("If true, only tasks past their due date and not completed"),
    },
    handler: async ({ status, assigneeId, priority, overdue }, ctx) => {
      requireAuth(ctx);
      const qs = new URLSearchParams();
      if (status) qs.set("status", status);
      if (assigneeId) qs.set("assigneeId", assigneeId);
      if (priority) qs.set("priority", priority);
      if (overdue) qs.set("overdue", "true");
      const suffix = qs.toString() ? `?${qs.toString()}` : "";
      return apiRequest(ctx, `/tasks${suffix}`);
    },
  }),

  defineTool({
    name: "get_task",
    description: "Get full details and history for a single task by ID.",
    category: "Tasks",
    inputShape: { taskId: z.string().describe("Task ID") },
    handler: async ({ taskId }, ctx) => {
      requireAuth(ctx);
      return apiRequest(ctx, `/tasks/${taskId}`);
    },
  }),

  defineTool({
    name: "get_task_history",
    description: "Get the audit trail (created/assigned/started/completed/updated events) for a task.",
    category: "Tasks",
    inputShape: { taskId: z.string().describe("Task ID") },
    handler: async ({ taskId }, ctx) => {
      requireAuth(ctx);
      return apiRequest(ctx, `/tasks/${taskId}/history`);
    },
  }),

  defineTool({
    name: "create_task",
    description:
      "Create a new task, optionally assigning it to a user immediately. Only ADMIN and MANAGER can create tasks.",
    category: "Tasks",
    requiredRoles: ADMIN_MANAGER,
    inputShape: {
      title: z.string().min(1).describe("Short task title"),
      description: z.string().optional().describe("Longer task description"),
      priority: TASK_PRIORITY.optional().describe("HIGH, MEDIUM, or LOW; defaults to MEDIUM"),
      dueDate: z.string().datetime().optional().describe("ISO 8601 deadline, e.g. 2026-08-01T00:00:00.000Z"),
      assigneeId: z.string().optional().describe("User ID to assign the task to"),
    },
    handler: async (body, ctx) => {
      requireAuth(ctx);
      return apiRequest(ctx, "/tasks", { method: "POST", body });
    },
  }),

  defineTool({
    name: "update_task",
    description:
      "Edit a task's title, description, priority, and/or due date. Only ADMIN and MANAGER can edit tasks.",
    category: "Tasks",
    requiredRoles: ADMIN_MANAGER,
    inputShape: {
      taskId: z.string().describe("Task ID"),
      title: z.string().min(1).optional(),
      description: z.string().optional(),
      priority: TASK_PRIORITY.optional(),
      dueDate: z.string().datetime().optional().describe("ISO 8601 deadline"),
    },
    handler: async ({ taskId, ...body }, ctx) => {
      requireAuth(ctx);
      return apiRequest(ctx, `/tasks/${taskId}`, { method: "PATCH", body });
    },
  }),

  defineTool({
    name: "assign_task",
    description:
      "Assign or reassign a task to a user, or unassign it by omitting assigneeId. " +
      "Only ADMIN and MANAGER can assign tasks.",
    category: "Tasks",
    requiredRoles: ADMIN_MANAGER,
    inputShape: {
      taskId: z.string().describe("Task ID"),
      assigneeId: z.string().optional().describe("User ID to assign to; omit to unassign"),
    },
    handler: async ({ taskId, assigneeId }, ctx) => {
      requireAuth(ctx);
      return apiRequest(ctx, `/tasks/${taskId}/assign`, {
        method: "PATCH",
        body: { assigneeId: assigneeId ?? null },
      });
    },
  }),

  defineTool({
    name: "start_task",
    description:
      "Move a task from TODO to IN_PROGRESS. A MEMBER may only start a task assigned to them; " +
      "ADMIN and MANAGER may start any task.",
    category: "Tasks",
    inputShape: { taskId: z.string().describe("Task ID") },
    handler: async ({ taskId }, ctx) => {
      requireAuth(ctx);
      return apiRequest(ctx, `/tasks/${taskId}/start`, { method: "POST" });
    },
  }),

  defineTool({
    name: "complete_task",
    description:
      "Mark a task COMPLETED. A MEMBER may only complete a task assigned to them; " +
      "ADMIN and MANAGER may complete any task.",
    category: "Tasks",
    inputShape: { taskId: z.string().describe("Task ID") },
    handler: async ({ taskId }, ctx) => {
      requireAuth(ctx);
      return apiRequest(ctx, `/tasks/${taskId}/complete`, { method: "POST" });
    },
  }),

  defineTool({
    name: "delete_task",
    description: "Permanently delete a task and its history. Only ADMIN and MANAGER can delete tasks.",
    category: "Tasks",
    requiredRoles: ADMIN_MANAGER,
    inputShape: { taskId: z.string().describe("Task ID") },
    handler: async ({ taskId }, ctx) => {
      requireAuth(ctx);
      await apiRequest(ctx, `/tasks/${taskId}`, { method: "DELETE" });
      return { message: `Task ${taskId} deleted` };
    },
  }),

  defineTool({
    name: "list_comments",
    description: "List the comment thread on a task, oldest first.",
    category: "Tasks",
    inputShape: { taskId: z.string().describe("Task ID") },
    handler: async ({ taskId }, ctx) => {
      requireAuth(ctx);
      return apiRequest(ctx, `/tasks/${taskId}/comments`);
    },
  }),

  defineTool({
    name: "add_comment",
    description:
      "Add a comment to a task's discussion thread. ADMIN and MANAGER can comment on any task; a MEMBER " +
      "can only comment on a task assigned to them.",
    category: "Tasks",
    inputShape: {
      taskId: z.string().describe("Task ID"),
      body: z.string().min(1).describe("Comment text"),
    },
    handler: async ({ taskId, body }, ctx) => {
      requireAuth(ctx);
      return apiRequest(ctx, `/tasks/${taskId}/comments`, { method: "POST", body: { body } });
    },
  }),

  // ---- Users -----------------------------------------------------------
  defineTool({
    name: "list_users",
    description: "List every user in the workspace with their role. Only ADMIN and MANAGER can view this.",
    category: "Users",
    requiredRoles: ADMIN_MANAGER,
    inputShape: {},
    handler: async (_args, ctx) => {
      requireAuth(ctx);
      return apiRequest(ctx, "/users");
    },
  }),

  defineTool({
    name: "create_user",
    description: "Create a new user account with a role. Only ADMIN can create users.",
    category: "Users",
    requiredRoles: ["ADMIN"],
    inputShape: {
      name: z.string().min(1),
      email: z.string().email(),
      password: z.string().min(8).describe("Temporary password, at least 8 characters"),
      roleName: z.string().describe("Role name, e.g. ADMIN, MANAGER, or MEMBER"),
    },
    handler: async (body, ctx) => {
      requireAuth(ctx);
      return apiRequest(ctx, "/users", { method: "POST", body });
    },
  }),

  defineTool({
    name: "update_user",
    description: "Update a user's name, email, and/or role. Only ADMIN can update users.",
    category: "Users",
    requiredRoles: ["ADMIN"],
    inputShape: {
      userId: z.string(),
      name: z.string().min(1).optional(),
      email: z.string().email().optional(),
      roleName: z.string().optional(),
    },
    handler: async ({ userId, ...body }, ctx) => {
      requireAuth(ctx);
      return apiRequest(ctx, `/users/${userId}`, { method: "PATCH", body });
    },
  }),

  defineTool({
    name: "delete_user",
    description:
      "Permanently delete a user account. Only ADMIN can delete users, and an admin cannot delete " +
      "their own account.",
    category: "Users",
    requiredRoles: ["ADMIN"],
    inputShape: { userId: z.string() },
    handler: async ({ userId }, ctx) => {
      requireAuth(ctx);
      await apiRequest(ctx, `/users/${userId}`, { method: "DELETE" });
      return { message: `User ${userId} deleted` };
    },
  }),

  // ---- Roles -----------------------------------------------------------
  defineTool({
    name: "list_roles",
    description: "List all roles and how many users hold each one. Only ADMIN can view this.",
    category: "Roles",
    requiredRoles: ["ADMIN"],
    inputShape: {},
    handler: async (_args, ctx) => {
      requireAuth(ctx);
      return apiRequest(ctx, "/roles");
    },
  }),

  defineTool({
    name: "create_role",
    description: "Create a new custom role. Only ADMIN can create roles.",
    category: "Roles",
    requiredRoles: ["ADMIN"],
    inputShape: { name: z.string().min(1), description: z.string().optional() },
    handler: async (body, ctx) => {
      requireAuth(ctx);
      return apiRequest(ctx, "/roles", { method: "POST", body });
    },
  }),

  defineTool({
    name: "update_role",
    description:
      "Update a role's name/description. Only ADMIN can update roles; the built-in ADMIN, MANAGER, " +
      "and MEMBER roles cannot be renamed.",
    category: "Roles",
    requiredRoles: ["ADMIN"],
    inputShape: { roleId: z.string(), name: z.string().min(1).optional(), description: z.string().optional() },
    handler: async ({ roleId, ...body }, ctx) => {
      requireAuth(ctx);
      return apiRequest(ctx, `/roles/${roleId}`, { method: "PATCH", body });
    },
  }),

  defineTool({
    name: "delete_role",
    description:
      "Delete a custom role. Only ADMIN can delete roles; built-in roles and roles still assigned " +
      "to users cannot be deleted.",
    category: "Roles",
    requiredRoles: ["ADMIN"],
    inputShape: { roleId: z.string() },
    handler: async ({ roleId }, ctx) => {
      requireAuth(ctx);
      await apiRequest(ctx, `/roles/${roleId}`, { method: "DELETE" });
      return { message: `Role ${roleId} deleted` };
    },
  }),
];

export function findTool(name: string): ToolDef | undefined {
  return registry.find((t) => t.name === name);
}
