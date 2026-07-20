import { useCallback, useEffect, useState } from "react";
import { api, type Task, type TaskPriority, type User } from "../lib/api";
import { useAuth } from "../lib/auth";
import { TaskBoard } from "../components/TaskBoard";

export function AllTasksPage() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [priority, setPriority] = useState<TaskPriority | "">("");
  const [overdueOnly, setOverdueOnly] = useState(false);

  const refresh = useCallback(async () => {
    const [taskRes, userRes] = await Promise.all([
      api.listTasks({ priority: priority || undefined, overdue: overdueOnly || undefined }),
      api.listUsers(),
    ]);
    setTasks(taskRes.tasks);
    setUsers(userRes.users);
  }, [priority, overdueOnly]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (!user) return null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-white">All Tasks</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Every task across the team.</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as TaskPriority | "")}
            className="field-sm"
          >
            <option value="">All priorities</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
          <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
            <input
              type="checkbox"
              checked={overdueOnly}
              onChange={(e) => setOverdueOnly(e.target.checked)}
              className="rounded border-slate-300 dark:border-slate-600"
            />
            Overdue only
          </label>
        </div>
      </div>
      <TaskBoard
        tasks={tasks}
        users={users}
        currentUserId={user.id}
        canManage
        onChanged={refresh}
        emptyLabel="No tasks match these filters."
      />
    </div>
  );
}
