import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { prisma } from "../lib/prisma.js";
import { authenticate, requireRole } from "../middleware/auth.js";

const MANAGE_ROLES = ["ADMIN", "MANAGER"];

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
  roleName: z.string().min(1),
});

const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  roleName: z.string().min(1).optional(),
});

const changeRoleSchema = z.object({ roleName: z.string().min(1) });

const idParamSchema = { type: "object", properties: { id: { type: "string" } }, required: ["id"] };

const userSelect = {
  id: true,
  email: true,
  name: true,
  createdAt: true,
  role: { select: { id: true, name: true } },
} as const;

export async function userRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  // ADMIN + MANAGER: MANAGER needs the roster to assign tasks (read-only for them).
  app.get(
    "/users",
    { preHandler: requireRole(...MANAGE_ROLES), schema: { tags: ["Users"], summary: "List users" } },
    async (_request, reply) => {
      const users = await prisma.user.findMany({
        select: userSelect,
        orderBy: { name: "asc" },
      });
      return reply.send({ users });
    },
  );

  app.get(
    "/users/:id",
    {
      preHandler: requireRole(...MANAGE_ROLES),
      schema: { tags: ["Users"], summary: "Get a user", params: idParamSchema },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const user = await prisma.user.findUnique({ where: { id }, select: userSelect });
      if (!user) {
        return reply.code(404).send({ error: "User not found" });
      }
      return reply.send({ user });
    },
  );

  // ADMIN only: full user management.
  app.post(
    "/users",
    {
      preHandler: requireRole("ADMIN"),
      schema: { tags: ["Users"], summary: "Create a user", body: zodToJsonSchema(createUserSchema) },
    },
    async (request, reply) => {
      const body = createUserSchema.parse(request.body);

      const existing = await prisma.user.findUnique({ where: { email: body.email } });
      if (existing) {
        return reply.code(409).send({ error: "Email already registered" });
      }

      const role = await prisma.role.findUnique({ where: { name: body.roleName } });
      if (!role) {
        return reply.code(400).send({ error: `Unknown role: ${body.roleName}` });
      }

      const passwordHash = await bcrypt.hash(body.password, 10);
      const user = await prisma.user.create({
        data: { email: body.email, name: body.name, passwordHash, roleId: role.id },
        select: userSelect,
      });
      return reply.code(201).send({ user });
    },
  );

  app.patch(
    "/users/:id",
    {
      preHandler: requireRole("ADMIN"),
      schema: {
        tags: ["Users"],
        summary: "Update a user",
        params: idParamSchema,
        body: zodToJsonSchema(updateUserSchema),
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = updateUserSchema.parse(request.body);

      const existing = await prisma.user.findUnique({ where: { id } });
      if (!existing) {
        return reply.code(404).send({ error: "User not found" });
      }

      let roleId: string | undefined;
      if (body.roleName) {
        const role = await prisma.role.findUnique({ where: { name: body.roleName } });
        if (!role) {
          return reply.code(400).send({ error: `Unknown role: ${body.roleName}` });
        }
        roleId = role.id;
      }

      if (body.email && body.email !== existing.email) {
        const emailTaken = await prisma.user.findUnique({ where: { email: body.email } });
        if (emailTaken) {
          return reply.code(409).send({ error: "Email already registered" });
        }
      }

      const user = await prisma.user.update({
        where: { id },
        data: { name: body.name, email: body.email, roleId },
        select: userSelect,
      });
      return reply.send({ user });
    },
  );

  // Kept for backwards compatibility with the Phase 1 role-change-only flow.
  app.patch(
    "/users/:id/role",
    {
      preHandler: requireRole("ADMIN"),
      schema: {
        tags: ["Users"],
        summary: "Change a user's role (legacy)",
        description: "Superseded by PATCH /users/:id, which also accepts roleName. Kept for compatibility.",
        params: idParamSchema,
        body: zodToJsonSchema(changeRoleSchema),
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = changeRoleSchema.parse(request.body);

      const role = await prisma.role.findUnique({ where: { name: body.roleName } });
      if (!role) {
        return reply.code(400).send({ error: `Unknown role: ${body.roleName}` });
      }

      const user = await prisma.user.update({
        where: { id },
        data: { roleId: role.id },
        select: userSelect,
      });
      return reply.send({ user });
    },
  );

  app.delete(
    "/users/:id",
    {
      preHandler: requireRole("ADMIN"),
      schema: { tags: ["Users"], summary: "Delete a user", params: idParamSchema },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const actor = request.currentUser!;

      if (id === actor.id) {
        return reply.code(400).send({ error: "You cannot delete your own account" });
      }

      const existing = await prisma.user.findUnique({ where: { id } });
      if (!existing) {
        return reply.code(404).send({ error: "User not found" });
      }

      try {
        await prisma.user.delete({ where: { id } });
      } catch {
        return reply.code(409).send({
          error:
            "Cannot delete this user: they have created tasks or history entries. Reassign or remove those first.",
        });
      }
      return reply.code(204).send();
    },
  );
}
