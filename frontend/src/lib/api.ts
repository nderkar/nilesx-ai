const API_BASE = "/api";

export type RoleName = "ADMIN" | "MANAGER" | "MEMBER" | string;

export interface Role {
  id: string;
  name: RoleName;
  description?: string | null;
  _count?: { users: number };
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export type TaskStatus = "TODO" | "IN_PROGRESS" | "COMPLETED";
export type TaskPriority = "HIGH" | "MEDIUM" | "LOW";

export interface Task {
  id: string;
  title: string;
  description?: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
  createdBy: { id: string; name: string; email: string };
  assignee: { id: string; name: string; email: string } | null;
}

export interface Comment {
  id: string;
  body: string;
  createdAt: string;
  author: { id: string; name: string };
}

export interface TaskHistoryEntry {
  id: string;
  action: string;
  fromValue: string | null;
  toValue: string | null;
  note: string | null;
  createdAt: string;
  actor: { id: string; name: string };
}

export interface ToolSetting {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  requiredRoles: string[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ActivityLogEntry {
  id: string;
  actorId: string | null;
  actorName: string;
  actorEmail: string;
  actorRole: string;
  client: string;
  method: string;
  path: string;
  statusCode: number;
  description: string;
  createdAt: string;
}

export interface NotificationEntry {
  id: string;
  taskId: string;
  taskTitle: string;
  actorName: string;
  action: string;
  description: string;
  createdAt: string;
}

export interface ReportSummary {
  byStatus: Record<TaskStatus, number>;
  byPriority: Record<TaskPriority, number>;
  byAssignee: { userId: string; name: string; count: number }[];
  unassignedCount: number;
  overdueCount: number;
  avgCompletionHours: number | null;
  completedByDay: { date: string; count: number }[];
}

export function isTaskOverdue(task: Pick<Task, "dueDate" | "status">): boolean {
  return Boolean(task.dueDate) && new Date(task.dueDate!).getTime() < Date.now() && task.status !== "COMPLETED";
}

function getToken(): string | null {
  return localStorage.getItem("token");
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (res.status === 204) {
    return undefined as T;
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  login: (email: string, password: string) =>
    request<{ token: string; user: { id: string; email: string; name: string; role: string } }>(
      "/auth/login",
      { method: "POST", body: JSON.stringify({ email, password }) },
    ),
  me: () => request<{ user: { id: string; email: string; name: string; roleName: string } }>("/auth/me"),

  // Users
  listUsers: () => request<{ users: User[] }>("/users"),
  createUser: (input: { email: string; password: string; name: string; roleName: string }) =>
    request<{ user: User }>("/users", { method: "POST", body: JSON.stringify(input) }),
  updateUser: (id: string, input: { name?: string; email?: string; roleName?: string }) =>
    request<{ user: User }>(`/users/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
  deleteUser: (id: string) => request<void>(`/users/${id}`, { method: "DELETE" }),

  // Roles
  listRoles: () => request<{ roles: Role[] }>("/roles"),
  createRole: (input: { name: string; description?: string }) =>
    request<{ role: Role }>("/roles", { method: "POST", body: JSON.stringify(input) }),
  updateRole: (id: string, input: { name?: string; description?: string | null }) =>
    request<{ role: Role }>(`/roles/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
  deleteRole: (id: string) => request<void>(`/roles/${id}`, { method: "DELETE" }),

  // Tasks
  listTasks: (filters?: { status?: TaskStatus; priority?: TaskPriority; overdue?: boolean }) => {
    const qs = new URLSearchParams();
    if (filters?.status) qs.set("status", filters.status);
    if (filters?.priority) qs.set("priority", filters.priority);
    if (filters?.overdue) qs.set("overdue", "true");
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return request<{ tasks: Task[] }>(`/tasks${suffix}`);
  },
  listMyTasks: () => request<{ tasks: Task[] }>("/tasks/my"),
  getTask: (id: string) =>
    request<{ task: Task & { history: TaskHistoryEntry[]; comments: Comment[] } }>(`/tasks/${id}`),
  getTaskHistory: (id: string) => request<{ history: TaskHistoryEntry[] }>(`/tasks/${id}/history`),

  createTask: (input: {
    title: string;
    description?: string;
    assigneeId?: string;
    priority?: TaskPriority;
    dueDate?: string | null;
  }) => request<{ task: Task }>("/tasks", { method: "POST", body: JSON.stringify(input) }),

  updateTask: (
    id: string,
    input: {
      title?: string;
      description?: string | null;
      priority?: TaskPriority;
      dueDate?: string | null;
    },
  ) => request<{ task: Task }>(`/tasks/${id}`, { method: "PATCH", body: JSON.stringify(input) }),

  assignTask: (id: string, assigneeId: string | null) =>
    request<{ task: Task }>(`/tasks/${id}/assign`, {
      method: "PATCH",
      body: JSON.stringify({ assigneeId }),
    }),

  startTask: (id: string) => request<{ task: Task }>(`/tasks/${id}/start`, { method: "POST" }),
  completeTask: (id: string) => request<{ task: Task }>(`/tasks/${id}/complete`, { method: "POST" }),
  deleteTask: (id: string) => request<void>(`/tasks/${id}`, { method: "DELETE" }),

  // Comments
  listComments: (taskId: string) => request<{ comments: Comment[] }>(`/tasks/${taskId}/comments`),
  addComment: (taskId: string, body: string) =>
    request<{ comment: Comment }>(`/tasks/${taskId}/comments`, {
      method: "POST",
      body: JSON.stringify({ body }),
    }),

  // Tool registry (Nilex AI — MCP + CLI tools)
  listToolSettings: () => request<{ tools: ToolSetting[] }>("/tool-settings"),
  setToolEnabled: (name: string, enabled: boolean) =>
    request<{ tool: ToolSetting }>(`/tool-settings/${name}`, {
      method: "PATCH",
      body: JSON.stringify({ enabled }),
    }),

  // Activity log
  listActivityLog: (limit = 100) =>
    request<{ entries: ActivityLogEntry[] }>(`/activity-log?limit=${limit}`),

  // Notifications
  listNotifications: () => request<{ notifications: NotificationEntry[] }>("/notifications"),

  // Reports
  getReportSummary: () => request<ReportSummary>("/reports/summary"),
};

export { getToken };
