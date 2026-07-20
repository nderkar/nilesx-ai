import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { prisma } from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function authRoutes(app: FastifyInstance) {
  // Note: there is no public self-registration endpoint. Accounts are
  // provisioned by an ADMIN via POST /users, so role assignment always
  // goes through an authorized, role-gated path.
  app.post(
    "/auth/login",
    {
      schema: {
        tags: ["Auth"],
        summary: "Log in",
        description: "The only unauthenticated route besides /health. Returns a JWT valid for 7 days.",
        security: [],
        body: zodToJsonSchema(loginSchema),
      },
    },
    async (request, reply) => {
      const body = loginSchema.parse(request.body);

      const user = await prisma.user.findUnique({
        where: { email: body.email },
        include: { role: true },
      });
      if (!user) {
        return reply.code(401).send({ error: "Invalid credentials" });
      }

      const valid = await bcrypt.compare(body.password, user.passwordHash);
      if (!valid) {
        return reply.code(401).send({ error: "Invalid credentials" });
      }

      const token = app.jwt.sign({ sub: user.id }, { expiresIn: "7d" });

      // Logged explicitly: the generic onResponse hook in server.ts only fires
      // for requests that already carry `request.currentUser`, but login is
      // the request that *creates* that identity, so it can't rely on the hook.
      const client = (request.headers["x-nilex-client"] as string | undefined) ?? "web";
      await prisma.activityLog
        .create({
          data: {
            actorId: user.id,
            actorName: user.name,
            actorEmail: user.email,
            actorRole: user.role.name,
            client,
            method: "POST",
            path: "/auth/login",
            statusCode: 200,
          },
        })
        .catch((err) => app.log.error(err, "failed to write login activity log entry"));

      return reply.send({
        token,
        user: { id: user.id, email: user.email, name: user.name, role: user.role.name },
      });
    },
  );

  app.get(
    "/auth/me",
    { preHandler: authenticate, schema: { tags: ["Auth"], summary: "Current identity" } },
    async (request, reply) => {
      return reply.send({ user: request.currentUser });
    },
  );
}
