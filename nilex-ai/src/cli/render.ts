import { color, priorityColor, statusColor } from "./colors.js";

interface TaskRow {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
  assignee: { name: string } | null;
}

interface CommentRow {
  id: string;
  body: string;
  createdAt: string;
  author: { name: string };
}

function isOverdue(task: TaskRow): boolean {
  return Boolean(task.dueDate) && new Date(task.dueDate!).getTime() < Date.now() && task.status !== "COMPLETED";
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

// Pad against the plain (uncolored) string first, then wrap in color — ANSI
// codes are zero-width visually, but if applied before padding they'd throw
// off column alignment because padEnd counts escape-code bytes as width.
function cell(plain: string, width: number, colorFn?: (s: string) => string): string {
  const padded = plain.padEnd(width);
  return colorFn ? colorFn(padded) : padded;
}

export function printTasks(tasks: TaskRow[]): void {
  if (tasks.length === 0) {
    console.log(color.dim("No tasks."));
    return;
  }

  const rows = tasks.map((t) => ({
    priority: t.priority,
    status: t.status,
    title: truncate(t.title, 32),
    due: t.dueDate ? formatDate(t.dueDate) + (isOverdue(t) ? " (overdue)" : "") : "-",
    overdue: isOverdue(t),
    assignee: t.assignee?.name ?? "Unassigned",
    id: t.id,
  }));

  const widths = {
    priority: Math.max(8, ...rows.map((r) => r.priority.length)),
    status: Math.max(11, ...rows.map((r) => r.status.length)),
    title: Math.max(5, ...rows.map((r) => r.title.length)),
    due: Math.max(3, ...rows.map((r) => r.due.length)),
    assignee: Math.max(8, ...rows.map((r) => r.assignee.length)),
  };

  const header = [
    cell("PRIORITY", widths.priority),
    cell("STATUS", widths.status),
    cell("TITLE", widths.title),
    cell("DUE", widths.due),
    cell("ASSIGNEE", widths.assignee),
    "ID",
  ].join("  ");
  console.log(color.bold(header));

  for (const r of rows) {
    const line = [
      cell(r.priority, widths.priority, (s) => priorityColor(r.priority, s)),
      cell(r.status, widths.status, (s) => statusColor(r.status, s)),
      cell(r.title, widths.title),
      cell(r.due, widths.due, r.overdue ? color.redBold : undefined),
      cell(r.assignee, widths.assignee, color.dim),
      color.dim(r.id),
    ].join("  ");
    console.log(line);
  }
}

export function printComments(comments: CommentRow[]): void {
  if (comments.length === 0) {
    console.log(color.dim("No comments yet."));
    return;
  }
  for (const c of comments) {
    const when = new Date(c.createdAt).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
    console.log(`${color.bold(c.author.name)} ${color.dim(`(${when})`)}`);
    console.log(`  ${c.body}`);
  }
}

export function printTaskDetail(task: {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueDate: string | null;
  startedAt: string | null;
  completedAt: string | null;
  assignee: { name: string } | null;
  createdBy: { name: string };
}): void {
  console.log(color.bold(task.title));
  console.log(color.dim(task.id));
  if (task.description) console.log(task.description);
  console.log("");
  console.log(`Status:      ${statusColor(task.status, task.status)}`);
  console.log(`Priority:    ${priorityColor(task.priority, task.priority)}`);
  console.log(`Assignee:    ${task.assignee?.name ?? "Unassigned"}`);
  console.log(`Created by:  ${task.createdBy.name}`);
  if (task.dueDate) {
    const overdue = isOverdue(task as TaskRow);
    const dueText = formatDate(task.dueDate) + (overdue ? " (overdue)" : "");
    console.log(`Due:         ${overdue ? color.redBold(dueText) : dueText}`);
  }
  if (task.startedAt) console.log(`Started:     ${new Date(task.startedAt).toLocaleString()}`);
  if (task.completedAt) console.log(`Completed:   ${new Date(task.completedAt).toLocaleString()}`);
  if (task.startedAt && task.completedAt) {
    const ms = new Date(task.completedAt).getTime() - new Date(task.startedAt).getTime();
    console.log(`Time taken:  ${formatDuration(ms)}`);
  }
}

function formatDuration(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  if (hours < 24) return `${hours}h ${remMinutes}m`;
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return `${days}d ${remHours}h`;
}
