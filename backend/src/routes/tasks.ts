import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { prisma } from "../lib/prisma.js";
import { authenticate, requireRole } from "../middleware/auth.js";

const MANAGE_ROLES = ["ADMIN", "MANAGER"];
const TASK_PRIORITY = z.enum(["HIGH", "MEDIUM", "LOW"]);
const TASK_STATUS = z.enum(["TODO", "IN_PROGRESS", "COMPLETED"]);

const listTasksQuerySchema = z.object({
  status: TASK_STATUS.optional(),
  assigneeId: z.string().optional(),
  priority: TASK_PRIORITY.optional(),
  overdue: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
});

// Hand-written rather than derived from listTasksQuerySchema: that schema's
// `.transform()` on `overdue` describes the post-parse *internal* boolean,
// not the querystring's actual "true"/"false" string shape swagger/ajv need
// to validate against.
const listTasksQueryOpenApiSchema = {
  type: "object",
  properties: {
    status: { type: "string", enum: ["TODO", "IN_PROGRESS", "COMPLETED"] },
    assigneeId: { type: "string" },
    priority: { type: "string", enum: ["HIGH", "MEDIUM", "LOW"] },
    overdue: { type: "string", enum: ["true", "false"] },
  },
};

const createTaskSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  priority: TASK_PRIORITY.optional(),
  dueDate: z.string().datetime().optional(),
  assigneeId: z.string().optional(),
});

const updateTaskSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  priority: TASK_PRIORITY.optional(),
  dueDate: z.string().datetime().nullable().optional(),
});

const assignTaskSchema = z.object({
  assigneeId: z.string().nullable(),
});

const addCommentSchema = z.object({
  body: z.string().min(1),
});

const idParamSchema = { type: "object", properties: { id: { type: "string" } }, required: ["id"] };

const taskInclude = {
  createdBy: { select: { id: true, name: true, email: true } },
  assignee: { select: { id: true, name: true, email: true } },
} as const;

function canAccessTask(actor: { roleName: string; id: string }, task: { assigneeId: string | null }): boolean {
  return MANAGE_ROLES.includes(actor.roleName) || task.assigneeId === actor.id;
}

export async function taskRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  // ADMIN + MANAGER only: create tasks and assign to anyone.
  app.post(
    "/tasks",
    {
      preHandler: requireRole(...MANAGE_ROLES),
      schema: { tags: ["Tasks"], summary: "Create a task", body: zodToJsonSchema(createTaskSchema) },
    },
    async (request, reply) => {
      const body = createTaskSchema.parse(request.body);
      const actor = request.currentUser!;

      if (body.assigneeId) {
        const assignee = await prisma.user.findUnique({ where: { id: body.assigneeId } });
        if (!assignee) {
          return reply.code(400).send({ error: "assigneeId does not reference an existing user" });
        }
      }

      const task = await prisma.task.create({
        data: {
          title: body.title,
          description: body.description,
          priority: body.priority,
          dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
          createdById: actor.id,
          assigneeId: body.assigneeId,
        },
        include: taskInclude,
      });

      await prisma.taskHistory.create({
        data: {
          taskId: task.id,
          actorId: actor.id,
          action: "CREATED",
          toValue: task.status,
          note: task.assignee ? `Created and assigned to ${task.assignee.name}` : "Created",
        },
      });

      return reply.code(201).send({ task });
    },
  );

  // ADMIN + MANAGER only: the org-wide task list. Members use /tasks/my.
  app.get(
    "/tasks",
    {
      preHandler: requireRole(...MANAGE_ROLES),
      schema: {
        tags: ["Tasks"],
        summary: "List all tasks",
        querystring: listTasksQueryOpenApiSchema,
      },
    },
    async (request, reply) => {
      const { status, assigneeId, priority, overdue } = listTasksQuerySchema.parse(request.query);

      // "Overdue" is defined as dueDate < now AND status != COMPLETED, so it
      // must AND with an explicit status filter rather than replace it —
      // otherwise `?status=IN_PROGRESS&overdue=true` would silently widen to
      // every non-completed status instead of just IN_PROGRESS.
      const statusFilter = overdue
        ? status
          ? { equals: status, not: "COMPLETED" as const }
          : { not: "COMPLETED" as const }
        : status;

      const tasks = await prisma.task.findMany({
        where: {
          status: statusFilter,
          assigneeId: assigneeId || undefined,
          priority: priority ?? undefined,
          dueDate: overdue ? { lt: new Date() } : undefined,
        },
        include: taskInclude,
        orderBy: { createdAt: "desc" },
      });
      return reply.send({ tasks });
    },
  );

  app.get(
    "/tasks/my",
    { schema: { tags: ["Tasks"], summary: "List my tasks" } },
    async (request, reply) => {
      const actor = request.currentUser!;
      const tasks = await prisma.task.findMany({
        where: { assigneeId: actor.id },
        include: taskInclude,
        orderBy: { createdAt: "desc" },
      });
      return reply.send({ tasks });
    },
  );

  app.get(
    "/tasks/:id",
    { schema: { tags: ["Tasks"], summary: "Get task detail", params: idParamSchema } },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const actor = request.currentUser!;
      const task = await prisma.task.findUnique({
        where: { id },
        include: {
          ...taskInclude,
          history: {
            orderBy: { createdAt: "asc" },
            include: { actor: { select: { id: true, name: true } } },
          },
          comments: {
            orderBy: { createdAt: "asc" },
            include: { author: { select: { id: true, name: true } } },
          },
        },
      });
      if (!task) {
        return reply.code(404).send({ error: "Task not found" });
      }
      if (!canAccessTask(actor, task)) {
        return reply.code(403).send({ error: "You do not have access to this task" });
      }
      return reply.send({ task });
    },
  );

  app.get(
    "/tasks/:id/history",
    { schema: { tags: ["Tasks"], summary: "Get task history", params: idParamSchema } },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const actor = request.currentUser!;
      const task = await prisma.task.findUnique({ where: { id } });
      if (!task) {
        return reply.code(404).send({ error: "Task not found" });
      }
      if (!canAccessTask(actor, task)) {
        return reply.code(403).send({ error: "You do not have access to this task" });
      }
      const history = await prisma.taskHistory.findMany({
        where: { taskId: id },
        orderBy: { createdAt: "asc" },
        include: { actor: { select: { id: true, name: true } } },
      });
      return reply.send({ history });
    },
  );

  app.get(
    "/tasks/:id/comments",
    { schema: { tags: ["Tasks"], summary: "List a task's comments", params: idParamSchema } },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const actor = request.currentUser!;
      const task = await prisma.task.findUnique({ where: { id } });
      if (!task) {
        return reply.code(404).send({ error: "Task not found" });
      }
      if (!canAccessTask(actor, task)) {
        return reply.code(403).send({ error: "You do not have access to this task" });
      }
      const comments = await prisma.comment.findMany({
        where: { taskId: id },
        orderBy: { createdAt: "asc" },
        include: { author: { select: { id: true, name: true } } },
      });
      return reply.send({ comments });
    },
  );

  // Same actors who can start/complete a task can comment on it: ADMIN/MANAGER
  // on anything, MEMBER only on tasks assigned to them.
  app.post(
    "/tasks/:id/comments",
    {
      schema: {
        tags: ["Tasks"],
        summary: "Add a comment",
        params: idParamSchema,
        body: zodToJsonSchema(addCommentSchema),
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const actor = request.currentUser!;
      const body = addCommentSchema.parse(request.body);

      const task = await prisma.task.findUnique({ where: { id } });
      if (!task) {
        return reply.code(404).send({ error: "Task not found" });
      }
      if (!canAccessTask(actor, task)) {
        return reply.code(403).send({ error: "You do not have access to this task" });
      }

      const comment = await prisma.comment.create({
        data: { taskId: id, authorId: actor.id, body: body.body },
        include: { author: { select: { id: true, name: true } } },
      });

      return reply.code(201).send({ comment });
    },
  );

  // ADMIN + MANAGER only: edit task details.
  app.patch(
    "/tasks/:id",
    {
      preHandler: requireRole(...MANAGE_ROLES),
      schema: {
        tags: ["Tasks"],
        summary: "Update a task",
        params: idParamSchema,
        body: zodToJsonSchema(updateTaskSchema),
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = updateTaskSchema.parse(request.body);
      const actor = request.currentUser!;

      const existing = await prisma.task.findUnique({ where: { id } });
      if (!existing) {
        return reply.code(404).send({ error: "Task not found" });
      }

      const task = await prisma.task.update({
        where: { id },
        data: {
          title: body.title,
          description: body.description,
          priority: body.priority,
          dueDate:
            body.dueDate === undefined ? undefined : body.dueDate === null ? null : new Date(body.dueDate),
        },
        include: taskInclude,
      });

      await prisma.taskHistory.create({
        data: {
          taskId: task.id,
          actorId: actor.id,
          action: "UPDATED",
          note: "Task details updated",
        },
      });

      return reply.send({ task });
    },
  );

  // ADMIN + MANAGER only: assign/reassign to anyone.
  app.patch(
    "/tasks/:id/assign",
    {
      preHandler: requireRole(...MANAGE_ROLES),
      schema: {
        tags: ["Tasks"],
        summary: "Assign or unassign a task",
        params: idParamSchema,
        body: zodToJsonSchema(assignTaskSchema),
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = assignTaskSchema.parse(request.body);
      const actor = request.currentUser!;

      const existing = await prisma.task.findUnique({ where: { id } });
      if (!existing) {
        return reply.code(404).send({ error: "Task not found" });
      }

      if (body.assigneeId) {
        const assignee = await prisma.user.findUnique({ where: { id: body.assigneeId } });
        if (!assignee) {
          return reply.code(400).send({ error: "assigneeId does not reference an existing user" });
        }
      }

      const task = await prisma.task.update({
        where: { id },
        data: { assigneeId: body.assigneeId },
        include: taskInclude,
      });

      await prisma.taskHistory.create({
        data: {
          taskId: task.id,
          actorId: actor.id,
          action: existing.assigneeId ? "REASSIGNED" : "ASSIGNED",
          fromValue: existing.assigneeId,
          toValue: body.assigneeId,
        },
      });

      return reply.send({ task });
    },
  );

  // ADMIN + MANAGER can start/complete any task; MEMBER only their own.
  app.post(
    "/tasks/:id/start",
    { schema: { tags: ["Tasks"], summary: "Start a task (TODO -> IN_PROGRESS)", params: idParamSchema } },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const actor = request.currentUser!;

      const existing = await prisma.task.findUnique({ where: { id } });
      if (!existing) {
        return reply.code(404).send({ error: "Task not found" });
      }
      if (!canAccessTask(actor, existing)) {
        return reply.code(403).send({ error: "You can only start tasks assigned to you" });
      }
      if (existing.status !== "TODO") {
        return reply.code(409).send({ error: `Cannot start a task in status ${existing.status}` });
      }

      const task = await prisma.task.update({
        where: { id },
        data: { status: "IN_PROGRESS", startedAt: new Date() },
        include: taskInclude,
      });

      await prisma.taskHistory.create({
        data: {
          taskId: task.id,
          actorId: actor.id,
          action: "STARTED",
          fromValue: existing.status,
          toValue: task.status,
        },
      });

      return reply.send({ task });
    },
  );

  app.post(
    "/tasks/:id/complete",
    { schema: { tags: ["Tasks"], summary: "Complete a task", params: idParamSchema } },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const actor = request.currentUser!;

      const existing = await prisma.task.findUnique({ where: { id } });
      if (!existing) {
        return reply.code(404).send({ error: "Task not found" });
      }
      if (!canAccessTask(actor, existing)) {
        return reply.code(403).send({ error: "You can only complete tasks assigned to you" });
      }
      if (existing.status === "COMPLETED") {
        return reply.code(409).send({ error: "Task is already completed" });
      }

      const task = await prisma.task.update({
        where: { id },
        data: { status: "COMPLETED", completedAt: new Date(), startedAt: existing.startedAt ?? new Date() },
        include: taskInclude,
      });

      await prisma.taskHistory.create({
        data: {
          taskId: task.id,
          actorId: actor.id,
          action: "COMPLETED",
          fromValue: existing.status,
          toValue: task.status,
        },
      });

      return reply.send({ task });
    },
  );

  // ADMIN + MANAGER only: delete a task (cascades its history).
  app.delete(
    "/tasks/:id",
    {
      preHandler: requireRole(...MANAGE_ROLES),
      schema: { tags: ["Tasks"], summary: "Delete a task", params: idParamSchema },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const existing = await prisma.task.findUnique({ where: { id } });
      if (!existing) {
        return reply.code(404).send({ error: "Task not found" });
      }
      await prisma.task.delete({ where: { id } });
      return reply.code(204).send();
    },
  );
}
