import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { authenticate, requireRole } from "../middleware/auth.js";
import { describeActivity } from "../lib/activityDescriptions.js";

export async function activityLogRoutes(app: FastifyInstance) {
  app.get(
    "/activity-log",
    { preHandler: [authenticate, requireRole("ADMIN")] },
    async (request, reply) => {
      const { limit } = request.query as { limit?: string };
      const take = Math.min(Number(limit) || 100, 200);

      const entries = await prisma.activityLog.findMany({
        orderBy: { createdAt: "desc" },
        take,
      });

      return reply.send({
        entries: entries.map((e) => ({
          ...e,
          description: describeActivity(e.method, e.path),
        })),
      });
    },
  );
}
