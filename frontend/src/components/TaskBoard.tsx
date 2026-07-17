import { useState } from "react";
import { api, isTaskOverdue, type Task, type TaskPriority, type TaskStatus, type User } from "../lib/api";
import { TaskFormModal } from "./TaskFormModal";
import { TaskDetailModal } from "./TaskDetailModal";
import { IconEdit, IconPlus, IconTrash } from "./icons";

const STATUS_COLUMNS: { status: TaskStatus; label: string; accent: string }[] = [
  { status: "TODO", label: "To Do", accent: "border-t-slate-300 dark:border-t-slate-600" },
  { status: "IN_PROGRESS", label: "In Progress", accent: "border-t-amber-400" },
  { status: "COMPLETED", label: "Completed", accent: "border-t-emerald-400" },
];

const PRIORITY_BADGE: Record<TaskPriority, string> = {
  HIGH: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400",
  MEDIUM: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
  LOW: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
};

const PRIORITY_LABEL: Record<TaskPriority, string> = { HIGH: "High", MEDIUM: "Medium", LOW: "Low" };

function formatDueDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

interface TaskBoardProps {
  tasks: Task[];
  users: User[];
  currentUserId: string;
  canManage: boolean;
  onChanged: () => void | Promise<void>;
  emptyLabel?: string;
}

export function TaskBoard({ tasks, users, currentUserId, canManage, onChanged, emptyLabel }: TaskBoardProps) {
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [viewingTaskId, setViewingTaskId] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>) {
    try {
      setError(null);
      await action();
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  function canActOn(task: Task) {
    return canManage || task.assignee?.id === currentUserId;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div />
        {canManage && (
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500"
          >
            <IconPlus className="h-4 w-4" />
            New task
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-500/10 dark:text-red-400">
          {error}
        </div>
      )}

      {tasks.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 py-10 text-center text-sm text-slate-400 dark:border-slate-700">
          {emptyLabel ?? "No tasks yet."}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {STATUS_COLUMNS.map((col) => {
            const colTasks = tasks.filter((t) => t.status === col.status);
            return (
              <div
                key={col.status}
                className={`rounded-lg border border-t-4 border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900 ${col.accent}`}
              >
                <h2 className="mb-3 flex items-center justify-between text-sm font-semibold text-slate-700 dark:text-slate-200">
                  {col.label}
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                    {colTasks.length}
                  </span>
                </h2>
                <div className="space-y-3">
                  {colTasks.map((task) => {
                    const overdue = isTaskOverdue(task);
                    return (
                    <div
                      key={task.id}
                      className={`rounded-md border p-3 text-sm shadow-sm ${
                        overdue
                          ? "border-red-300 dark:border-red-800"
                          : "border-slate-200 dark:border-slate-700"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <button
                          onClick={() => setViewingTaskId(task.id)}
                          className="text-left font-medium text-slate-900 hover:text-indigo-600 hover:underline dark:text-white dark:hover:text-indigo-400"
                        >
                          {task.title}
                        </button>
                        {canManage && (
                          <div className="flex shrink-0 gap-1">
                            <button
                              onClick={() => setEditingTask(task)}
                              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
                              title="Edit"
                            >
                              <IconEdit className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => {
                                if (confirm(`Delete "${task.title}"? This cannot be undone.`)) {
                                  run(() => api.deleteTask(task.id));
                                }
                              }}
                              className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10"
                              title="Delete"
                            >
                              <IconTrash className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <span
                          className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${PRIORITY_BADGE[task.priority]}`}
                        >
                          {PRIORITY_LABEL[task.priority]}
                        </span>
                        {task.dueDate && (
                          <span
                            className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                              overdue
                                ? "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400"
                                : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                            }`}
                          >
                            {overdue ? "Overdue " : "Due "}
                            {formatDueDate(task.dueDate)}
                          </span>
                        )}
                      </div>

                      {task.description && (
                        <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">{task.description}</p>
                      )}

                      <div className="mt-2 flex items-center justify-between gap-2">
                        {canManage ? (
                          <select
                            value={task.assignee?.id ?? ""}
                            onChange={(e) => run(() => api.assignTask(task.id, e.target.value || null))}
                            className="rounded border border-slate-300 bg-white px-1.5 py-1 text-xs text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                          >
                            <option value="">Unassigned</option>
                            {users.map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            {task.assignee ? task.assignee.name : "Unassigned"}
                          </span>
                        )}

                        {canActOn(task) && (
                          <div className="flex gap-1">
                            {task.status === "TODO" && (
                              <button
                                onClick={() => run(() => api.startTask(task.id))}
                                className="rounded bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800 hover:bg-amber-200 dark:bg-amber-500/15 dark:text-amber-300"
                              >
                                Start
                              </button>
                            )}
                            {task.status !== "COMPLETED" && (
                              <button
                                onClick={() => run(() => api.completeTask(task.id))}
                                className="rounded bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300"
                              >
                                Complete
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    );
                  })}
                  {colTasks.length === 0 && <p className="text-xs text-slate-400">No tasks</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {creating && (
        <TaskFormModal
          mode="create"
          users={users}
          onClose={() => setCreating(false)}
          onSubmit={async (input) => {
            await api.createTask(input);
            await onChanged();
          }}
        />
      )}

      {editingTask && (
        <TaskFormModal
          mode="edit"
          task={editingTask}
          users={users}
          onClose={() => setEditingTask(null)}
          onSubmit={async (input) => {
            await api.updateTask(editingTask.id, {
              title: input.title,
              description: input.description,
              priority: input.priority,
              dueDate: input.dueDate,
            });
            await onChanged();
          }}
        />
      )}

      {viewingTaskId && (
        <TaskDetailModal taskId={viewingTaskId} onClose={() => setViewingTaskId(null)} />
      )}
    </div>
  );
}
