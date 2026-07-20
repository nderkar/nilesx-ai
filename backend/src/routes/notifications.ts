import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";

const DUE_SOON_WINDOW_MS = 24 * 60 * 60 * 1000;

interface NotificationEntry {
  id: string;
  taskId: string;
  taskTitle: string;
  actorName: string;
  action: string;
  description: string;
  createdAt: Date;
}

function describeHistoryNotification(entry: {
  action: string;
  task: { title: string };
  actor: { name: string };
}): string {
  const title = entry.task.title;
  const actor = entry.actor.name;
  switch (entry.action) {
    case "CREATED":
      return `${actor} created "${title}" and assigned it to you`;
    case "ASSIGNED":
      return `${actor} assigned "${title}" to you`;
    case "REASSIGNED":
      return `${actor} reassigned "${title}" to you`;
    case "STARTED":
      return `${actor} started "${title}"`;
    case "COMPLETED":
      return `${actor} completed "${title}"`;
    case "UPDATED":
      return `${actor} updated "${title}"`;
    default:
      return `${actor} changed "${title}"`;
  }
}

function formatDueDate(due: Date): string {
  return due.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export async function notificationRoutes(app: FastifyInstance) {
  // "Basic" notifications, no push infra: derived on-demand from TaskHistory,
  // Comment, and Task.dueDate rather than a dedicated notifications table,
  // and polled by the frontend rather than pushed. Relevant to a user =
  // something happened, done by someone ELSE, on a task they're currently
  // the assignee or creator of (history/comments); or a task they're
  // currently the assignee/creator of has a deadline approaching or passed
  // (due-date reminders, which have no "actor" — they're derived from
  // current state, not an event).
  app.get(
    "/notifications",
    {
      preHandler: authenticate,
      schema: { tags: ["Notifications"], summary: "List my notifications (most recent 20)" },
    },
    async (request, reply) => {
      const userId = request.currentUser!.id;
      const now = new Date();
      const dueSoonCutoff = new Date(now.getTime() + DUE_SOON_WINDOW_MS);

      const [historyEntries, comments, dueTasks] = await Promise.all([
        prisma.taskHistory.findMany({
          where: {
            actorId: { not: userId },
            OR: [{ task: { assigneeId: userId } }, { task: { createdById: userId } }],
          },
          include: {
            task: { select: { id: true, title: true } },
            actor: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 20,
        }),
        prisma.comment.findMany({
          where: {
            authorId: { not: userId },
            OR: [{ task: { assigneeId: userId } }, { task: { createdById: userId } }],
          },
          include: {
            task: { select: { id: true, title: true } },
            author: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 20,
        }),
        prisma.task.findMany({
          where: {
            status: { not: "COMPLETED" },
            dueDate: { not: null, lte: dueSoonCutoff },
            OR: [{ assigneeId: userId }, { createdById: userId }],
          },
          select: { id: true, title: true, dueDate: true },
        }),
      ]);

      const entries: NotificationEntry[] = [];

      for (const e of historyEntries) {
        entries.push({
          id: `history:${e.id}`,
          taskId: e.task.id,
          taskTitle: e.task.title,
          actorName: e.actor.name,
          action: e.action,
          description: describeHistoryNotification(e),
          createdAt: e.createdAt,
        });
      }

      for (const c of comments) {
        entries.push({
          id: `comment:${c.id}`,
          taskId: c.task.id,
          taskTitle: c.task.title,
          actorName: c.author.name,
          action: "COMMENTED",
          description: `${c.author.name} commented on "${c.task.title}"`,
          createdAt: c.createdAt,
        });
      }

      for (const t of dueTasks) {
        const due = t.dueDate!;
        const overdue = due.getTime() < now.getTime();
        entries.push({
          id: `${overdue ? "overdue" : "duesoon"}:${t.id}`,
          taskId: t.id,
          taskTitle: t.title,
          actorName: "System",
          action: overdue ? "OVERDUE" : "DUE_SOON",
          description: overdue
            ? `"${t.title}" is overdue (was due ${formatDueDate(due)})`
            : `"${t.title}" is due soon (${formatDueDate(due)})`,
          // Synthetic, stable timestamp so the entry doesn't look "new" on
          // every poll: overdue becomes visible the moment it crosses the due
          // date; due-soon becomes visible the moment the 24h window opens.
          createdAt: overdue ? due : new Date(due.getTime() - DUE_SOON_WINDOW_MS),
        });
      }

      entries.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

      return reply.send({ notifications: entries.slice(0, 20) });
    },
  );
}
