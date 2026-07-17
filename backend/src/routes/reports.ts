import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { authenticate, requireRole } from "../middleware/auth.js";

const MANAGE_ROLES = ["ADMIN", "MANAGER"];
const TREND_DAYS = 14;

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function reportRoutes(app: FastifyInstance) {
  // "Basic" reporting: a handful of aggregates computed on demand from the
  // same Task/TaskHistory tables everything else already uses — no
  // dedicated analytics table or scheduled rollup job, which would be a lot
  // of infrastructure for a dashboard this size.
  app.get(
    "/reports/summary",
    { preHandler: [authenticate, requireRole(...MANAGE_ROLES)] },
    async (_request, reply) => {
      const now = new Date();
      const fourteenDaysAgo = new Date(now.getTime() - TREND_DAYS * 24 * 60 * 60 * 1000);

      const [statusGroups, priorityGroups, tasks, completedEntries, overdueCount, durations] =
        await Promise.all([
          prisma.task.groupBy({ by: ["status"], _count: { _all: true } }),
          prisma.task.groupBy({ by: ["priority"], _count: { _all: true } }),
          prisma.task.findMany({
            select: { assigneeId: true, assignee: { select: { id: true, name: true } } },
          }),
          prisma.taskHistory.findMany({
            where: { action: "COMPLETED", createdAt: { gte: fourteenDaysAgo } },
            select: { createdAt: true },
          }),
          prisma.task.count({ where: { status: { not: "COMPLETED" }, dueDate: { lt: now } } }),
          prisma.task.findMany({
            where: { startedAt: { not: null }, completedAt: { not: null } },
            select: { startedAt: true, completedAt: true },
          }),
        ]);

      const byStatus = { TODO: 0, IN_PROGRESS: 0, COMPLETED: 0 } as Record<string, number>;
      for (const g of statusGroups) byStatus[g.status] = g._count._all;

      const byPriority = { HIGH: 0, MEDIUM: 0, LOW: 0 } as Record<string, number>;
      for (const g of priorityGroups) byPriority[g.priority] = g._count._all;

      const avgCompletionHours =
        durations.length === 0
          ? null
          : durations.reduce(
              (sum, t) => sum + (t.completedAt!.getTime() - t.startedAt!.getTime()) / (1000 * 60 * 60),
              0,
            ) / durations.length;

      const byAssigneeMap = new Map<string, { userId: string; name: string; count: number }>();
      let unassignedCount = 0;
      for (const t of tasks) {
        if (!t.assignee) {
          unassignedCount += 1;
          continue;
        }
        const existing = byAssigneeMap.get(t.assignee.id) ?? {
          userId: t.assignee.id,
          name: t.assignee.name,
          count: 0,
        };
        existing.count += 1;
        byAssigneeMap.set(t.assignee.id, existing);
      }
      const byAssignee = [...byAssigneeMap.values()].sort((a, b) => b.count - a.count).slice(0, 10);

      // Zero-fill every day in the window first so the trend has no gaps,
      // then add real counts on top.
      const dayMap = new Map<string, number>();
      for (let i = TREND_DAYS - 1; i >= 0; i--) {
        const d = new Date();
        d.setUTCDate(d.getUTCDate() - i);
        dayMap.set(dayKey(d), 0);
      }
      for (const entry of completedEntries) {
        const key = dayKey(entry.createdAt);
        if (dayMap.has(key)) dayMap.set(key, (dayMap.get(key) ?? 0) + 1);
      }
      const completedByDay = [...dayMap.entries()].map(([date, count]) => ({ date, count }));

      return reply.send({
        byStatus,
        byPriority,
        byAssignee,
        unassignedCount,
        overdueCount,
        avgCompletionHours,
        completedByDay,
      });
    },
  );
}
