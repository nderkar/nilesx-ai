import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const roles = await Promise.all(
    ["ADMIN", "MANAGER", "MEMBER"].map((name) =>
      prisma.role.upsert({
        where: { name },
        update: {},
        create: { name, description: `${name.charAt(0)}${name.slice(1).toLowerCase()} role` },
      }),
    ),
  );
  const [adminRole, managerRole, memberRole] = roles;

  const passwordHash = await bcrypt.hash("password123", 10);

  const admin = await prisma.user.upsert({
    where: { email: "admin@example.com" },
    update: {},
    create: {
      email: "admin@example.com",
      name: "Alice Admin",
      passwordHash,
      roleId: adminRole.id,
    },
  });

  const manager = await prisma.user.upsert({
    where: { email: "manager@example.com" },
    update: {},
    create: {
      email: "manager@example.com",
      name: "Mo Manager",
      passwordHash,
      roleId: managerRole.id,
    },
  });

  const member = await prisma.user.upsert({
    where: { email: "member@example.com" },
    update: {},
    create: {
      email: "member@example.com",
      name: "Sam Member",
      passwordHash,
      roleId: memberRole.id,
    },
  });

  const existingTasks = await prisma.task.count();
  if (existingTasks === 0) {
    const task1 = await prisma.task.create({
      data: {
        title: "Set up project repository",
        description: "Initialize the repo, CI, and base project structure.",
        status: "COMPLETED",
        createdById: admin.id,
        assigneeId: manager.id,
      },
    });
    const task2 = await prisma.task.create({
      data: {
        title: "Design task database schema",
        description: "Model users, roles, tasks, and history.",
        status: "IN_PROGRESS",
        createdById: admin.id,
        assigneeId: manager.id,
      },
    });
    const task3 = await prisma.task.create({
      data: {
        title: "Build task assignment UI",
        description: "Dashboard view for assigning and tracking tasks.",
        status: "TODO",
        createdById: manager.id,
        assigneeId: member.id,
      },
    });

    await prisma.taskHistory.createMany({
      data: [
        { taskId: task1.id, actorId: admin.id, action: "CREATED", toValue: "TODO" },
        { taskId: task1.id, actorId: manager.id, action: "STARTED", fromValue: "TODO", toValue: "IN_PROGRESS" },
        { taskId: task1.id, actorId: manager.id, action: "COMPLETED", fromValue: "IN_PROGRESS", toValue: "COMPLETED" },
        { taskId: task2.id, actorId: admin.id, action: "CREATED", toValue: "TODO" },
        { taskId: task2.id, actorId: manager.id, action: "STARTED", fromValue: "TODO", toValue: "IN_PROGRESS" },
        { taskId: task3.id, actorId: manager.id, action: "CREATED", toValue: "TODO" },
      ],
    });
  }

  console.log("Seed complete. Sample logins (password: password123):");
  console.log("  admin@example.com   (ADMIN)");
  console.log("  manager@example.com (MANAGER)");
  console.log("  member@example.com  (MEMBER)");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
