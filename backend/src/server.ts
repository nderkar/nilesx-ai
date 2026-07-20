import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { authRoutes } from "./routes/auth.js";
import { roleRoutes } from "./routes/roles.js";
import { userRoutes } from "./routes/users.js";
import { taskRoutes } from "./routes/tasks.js";
import { toolSettingsRoutes } from "./routes/toolSettings.js";
import { activityLogRoutes } from "./routes/activityLog.js";
import { notificationRoutes } from "./routes/notifications.js";
import { reportRoutes } from "./routes/reports.js";
import { prisma } from "./lib/prisma.js";

const app = Fastify({ logger: true });

const port = Number(process.env.PORT ?? 4000);
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  throw new Error("JWT_SECRET environment variable is required");
}

await app.register(cors, { origin: true });
await app.register(jwt, { secret: jwtSecret });

// Registered before any route plugins, same reason as setErrorHandler below:
// @fastify/swagger collects each route's `schema` as it's registered, so it
// has to be attached first to see everything that comes after it.
await app.register(swagger, {
  openapi: {
    openapi: "3.0.3",
    info: {
      title: "Nilex Task Platform API",
      description:
        "Task/user/role management REST API. Every route below (except /health and " +
        "POST /auth/login) requires a JWT from POST /auth/login — use the Authorize button " +
        "with `Bearer <token>`. This is the same API the web dashboard, the `nilex` CLI, and " +
        "the MCP tool registry all call — see nilex-ai/README.md for the AI/automation layer.",
      version: "1.0.0",
    },
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
        syncKey: {
          type: "apiKey",
          in: "header",
          name: "x-sync-key",
          description: "Shared secret (TOOL_SYNC_KEY) for machine-to-machine tool-registry sync only.",
        },
      },
    },
    security: [{ bearerAuth: [] }],
    tags: [
      { name: "Auth", description: "Login and session identity" },
      { name: "Tasks", description: "Task CRUD, lifecycle, comments, and history" },
      { name: "Users", description: "User management (ADMIN, some read access for MANAGER)" },
      { name: "Roles", description: "Role management (ADMIN only)" },
      { name: "Tool Registry", description: "Nilex AI's MCP/CLI tool registry mirror" },
      { name: "Activity Log", description: "Cross-client audit trail (ADMIN only)" },
      { name: "Notifications", description: "Derived, on-demand notification feed" },
      { name: "Reports", description: "Aggregate reporting (ADMIN + MANAGER)" },
    ],
  },
});

await app.register(swaggerUi, { routePrefix: "/docs" });

app.get("/health", { schema: { hide: true } }, async () => ({ status: "ok" }));

// Registered before any route plugins: Fastify binds each route's error
// handler at registration time (not per-request), so routes registered
// before this call would otherwise keep falling back to Fastify's default
// handler — as they silently did until this was caught.
app.setErrorHandler((error: Error & { statusCode?: number; validation?: unknown }, _request, reply) => {
  // Two validators can reject a request now: the existing manual Zod
  // `.parse()` calls in each handler, and (as of adding OpenAPI schemas
  // below) Fastify's own built-in ajv validation running against those same
  // schemas before the handler is even reached. Both get normalized to the
  // same response shape so callers (CLI, MCP tools, the dashboard) see one
  // stable contract regardless of which layer caught the bad input.
  if (error.name === "ZodError") {
    return reply.code(400).send({ error: "Validation error", details: error.message });
  }
  if (error.validation) {
    return reply.code(400).send({ error: "Validation error", details: error.message });
  }
  app.log.error(error);
  return reply.code(error.statusCode ?? 500).send({ error: error.message });
});

await app.register(authRoutes);
await app.register(roleRoutes);
await app.register(userRoutes);
await app.register(taskRoutes);
await app.register(toolSettingsRoutes);
await app.register(activityLogRoutes);
await app.register(notificationRoutes);
await app.register(reportRoutes);

// Unified audit trail: every mutating request that passed through an
// `authenticate` preHandler (web dashboard, CLI, or MCP tool calls — they
// all end up as authenticated HTTP requests against this same API) gets one
// row here. Requests with no `currentUser` (health checks, unauthenticated
// routes, unmatched/404 paths) never reach a preHandler, so they're
// naturally excluded — no route-path allowlist to maintain.
app.addHook("onResponse", async (request, reply) => {
  if (request.method === "GET" || !request.currentUser) return;
  const client = (request.headers["x-nilex-client"] as string | undefined) ?? "web";
  await prisma.activityLog
    .create({
      data: {
        actorId: request.currentUser.id,
        actorName: request.currentUser.name,
        actorEmail: request.currentUser.email,
        actorRole: request.currentUser.roleName,
        client,
        method: request.method,
        path: request.routeOptions.url ?? request.url,
        statusCode: reply.statusCode,
      },
    })
    .catch((err) => app.log.error(err, "failed to write activity log entry"));
});

try {
  await app.listen({ port, host: "0.0.0.0" });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
