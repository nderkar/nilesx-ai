import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { prisma } from "../lib/prisma.js";
import { authenticate, requireRole } from "../middleware/auth.js";

const syncSchema = z.object({
  tools: z.array(
    z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      category: z.string().optional(),
      requiredRoles: z.array(z.string()).optional(),
    }),
  ),
});

const toggleSchema = z.object({ enabled: z.boolean() });

const nameParamSchema = { type: "object", properties: { name: { type: "string" } }, required: ["name"] };

export async function toolSettingsRoutes(app: FastifyInstance) {
  // Machine-to-machine only: nilex-ai calls this on startup with its current
  // registry so this table always mirrors the code, not a hand-maintained
  // copy. Authenticated with a shared secret, not a user JWT — there's no
  // "acting user" for a service pushing its own tool list at boot.
  app.post(
    "/tool-settings/sync",
    {
      schema: {
        tags: ["Tool Registry"],
        summary: "Sync the tool registry (nilex-ai only)",
        description: "Called by nilex-ai on startup. Requires X-Sync-Key, not a JWT.",
        security: [{ syncKey: [] }],
        body: zodToJsonSchema(syncSchema),
      },
    },
    async (request, reply) => {
      const syncKey = process.env.TOOL_SYNC_KEY;
      if (!syncKey) {
        return reply.code(503).send({ error: "TOOL_SYNC_KEY is not configured on the server" });
      }
      if (request.headers["x-sync-key"] !== syncKey) {
        return reply.code(401).send({ error: "Invalid sync key" });
      }

      const body = syncSchema.parse(request.body);

      for (const tool of body.tools) {
        await prisma.toolSetting.upsert({
          where: { name: tool.name },
          create: {
            name: tool.name,
            description: tool.description,
            category: tool.category,
            requiredRoles: tool.requiredRoles?.join(","),
          },
          // Deliberately does NOT touch `enabled` — that's admin-owned state,
          // not something a restart should silently reset.
          update: {
            description: tool.description,
            category: tool.category,
            requiredRoles: tool.requiredRoles?.join(","),
          },
        });
      }

      return reply.send({ synced: body.tools.length });
    },
  );

  app.get(
    "/tool-settings",
    { preHandler: authenticate, schema: { tags: ["Tool Registry"], summary: "List tool settings" } },
    async (_request, reply) => {
      const tools = await prisma.toolSetting.findMany({
        orderBy: [{ category: "asc" }, { name: "asc" }],
      });
      return reply.send({
        tools: tools.map((t) => ({
          ...t,
          requiredRoles: t.requiredRoles ? t.requiredRoles.split(",") : [],
        })),
      });
    },
  );

  app.patch(
    "/tool-settings/:name",
    {
      preHandler: [authenticate, requireRole("ADMIN")],
      schema: {
        tags: ["Tool Registry"],
        summary: "Enable or disable a tool",
        params: nameParamSchema,
        body: zodToJsonSchema(toggleSchema),
      },
    },
    async (request, reply) => {
      const { name } = request.params as { name: string };
      const body = toggleSchema.parse(request.body);

      const existing = await prisma.toolSetting.findUnique({ where: { name } });
      if (!existing) {
        return reply.code(404).send({ error: "Unknown tool. Has nilex-ai synced its registry yet?" });
      }

      const tool = await prisma.toolSetting.update({ where: { name }, data: { enabled: body.enabled } });
      return reply.send({ tool: { ...tool, requiredRoles: tool.requiredRoles ? tool.requiredRoles.split(",") : [] } });
    },
  );
}
