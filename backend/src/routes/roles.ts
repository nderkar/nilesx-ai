import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authenticate, requireRole } from "../middleware/auth.js";

const createRoleSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});

const updateRoleSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
});

const PROTECTED_ROLE_NAMES = ["ADMIN", "MANAGER", "MEMBER"];

export async function roleRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  // ADMIN only: role management is an admin-only surface.
  app.get("/roles", { preHandler: requireRole("ADMIN") }, async (_request, reply) => {
    const roles = await prisma.role.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { users: true } } },
    });
    return reply.send({ roles });
  });

  app.post("/roles", { preHandler: requireRole("ADMIN") }, async (request, reply) => {
    const body = createRoleSchema.parse(request.body);
    const existing = await prisma.role.findUnique({ where: { name: body.name } });
    if (existing) {
      return reply.code(409).send({ error: "A role with this name already exists" });
    }
    const role = await prisma.role.create({ data: body });
    return reply.code(201).send({ role });
  });

  app.patch("/roles/:id", { preHandler: requireRole("ADMIN") }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = updateRoleSchema.parse(request.body);

    const existing = await prisma.role.findUnique({ where: { id } });
    if (!existing) {
      return reply.code(404).send({ error: "Role not found" });
    }
    if (PROTECTED_ROLE_NAMES.includes(existing.name) && body.name && body.name !== existing.name) {
      return reply.code(400).send({ error: `Cannot rename the built-in ${existing.name} role` });
    }

    if (body.name && body.name !== existing.name) {
      const nameTaken = await prisma.role.findUnique({ where: { name: body.name } });
      if (nameTaken) {
        return reply.code(409).send({ error: "A role with this name already exists" });
      }
    }

    const role = await prisma.role.update({ where: { id }, data: body });
    return reply.send({ role });
  });

  app.delete("/roles/:id", { preHandler: requireRole("ADMIN") }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const existing = await prisma.role.findUnique({
      where: { id },
      include: { _count: { select: { users: true } } },
    });
    if (!existing) {
      return reply.code(404).send({ error: "Role not found" });
    }
    if (PROTECTED_ROLE_NAMES.includes(existing.name)) {
      return reply.code(400).send({ error: `Cannot delete the built-in ${existing.name} role` });
    }
    if (existing._count.users > 0) {
      return reply
        .code(409)
        .send({ error: "Cannot delete a role that still has users assigned to it" });
    }

    await prisma.role.delete({ where: { id } });
    return reply.code(204).send();
  });
}
