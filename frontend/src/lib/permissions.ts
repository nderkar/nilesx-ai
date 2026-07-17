export type Role = "ADMIN" | "MANAGER" | "MEMBER" | string;

// ADMIN + MANAGER: create/assign/edit/delete any task, see the org-wide task list.
// MEMBER: sees and acts only on tasks assigned to them (start/complete), no create/assign/edit/delete.
export function canManageTasks(role: Role): boolean {
  return role === "ADMIN" || role === "MANAGER";
}

// ADMIN + MANAGER: read the roster (needed to assign tasks). MEMBER: no access.
export function canViewUsers(role: Role): boolean {
  return role === "ADMIN" || role === "MANAGER";
}

// ADMIN only: create/update/delete users and roles.
export function canManageUsers(role: Role): boolean {
  return role === "ADMIN";
}

export function canManageRoles(role: Role): boolean {
  return role === "ADMIN";
}

// ADMIN only: enable/disable Nilex AI (MCP + CLI) tools org-wide.
export function canManageToolRegistry(role: Role): boolean {
  return role === "ADMIN";
}

// ADMIN only: view the cross-client (web/CLI/MCP) audit trail.
export function canViewActivityLog(role: Role): boolean {
  return role === "ADMIN";
}

// ADMIN + MANAGER: view aggregate task reporting (status/assignee breakdowns, completion trend).
export function canViewReports(role: Role): boolean {
  return role === "ADMIN" || role === "MANAGER";
}

export function roleLabel(role: Role): string {
  switch (role) {
    case "ADMIN":
      return "Administrator";
    case "MANAGER":
      return "Manager";
    case "MEMBER":
      return "Member";
    default:
      return role;
  }
}
