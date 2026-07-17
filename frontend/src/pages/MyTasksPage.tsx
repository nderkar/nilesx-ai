import { useCallback, useEffect, useState } from "react";
import { api, type Task, type User } from "../lib/api";
import { useAuth } from "../lib/auth";
import { canManageTasks } from "../lib/permissions";
import { TaskBoard } from "../components/TaskBoard";

export function MyTasksPage() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const manage = user ? canManageTasks(user.role) : false;

  const refresh = useCallback(async () => {
    const taskRes = await api.listMyTasks();
    setTasks(taskRes.tasks);
    if (manage) {
      const userRes = await api.listUsers();
      setUsers(userRes.users);
    }
  }, [manage]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (!user) return null;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-white">My Tasks</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">Tasks assigned to you.</p>
      </div>
      <TaskBoard
        tasks={tasks}
        users={users}
        currentUserId={user.id}
        canManage={manage}
        onChanged={refresh}
        emptyLabel="Nothing assigned to you right now."
      />
    </div>
  );
}
