import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
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

app.get("/health", async () => ({ status: "ok" }));

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

app.setErrorHandler((error: Error & { statusCode?: number }, _request, reply) => {
  if (error.name === "ZodError") {
    return reply.code(400).send({ error: "Validation error", details: error.message });
  }
  app.log.error(error);
  return reply.code(error.statusCode ?? 500).send({ error: error.message });
});

try {
  await app.listen({ port, host: "0.0.0.0" });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
