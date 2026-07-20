import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, isTaskOverdue, type ReportSummary, type Task } from "../lib/api";
import { useAuth } from "../lib/auth";
import { canManageTasks, canViewReports } from "../lib/permissions";

const STAT_CONFIG: { key: Task["status"]; label: string; color: string }[] = [
  { key: "TODO", label: "To Do", color: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200" },
  {
    key: "IN_PROGRESS",
    label: "In Progress",
    color: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
  },
  {
    key: "COMPLETED",
    label: "Completed",
    color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
  },
];

export function DashboardPage() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const manageScope = user ? canManageTasks(user.role) : false;
  const reportsVisible = user ? canViewReports(user.role) : false;

  useEffect(() => {
    (async () => {
      const res = manageScope ? await api.listTasks() : await api.listMyTasks();
      setTasks(res.tasks);
      setLoading(false);
    })();
  }, [manageScope]);

  useEffect(() => {
    if (!reportsVisible) return;
    api.getReportSummary().then(setSummary).catch(() => setSummary(null));
  }, [reportsVisible]);

  const counts = STAT_CONFIG.map((c) => ({
    ...c,
    count: tasks.filter((t) => t.status === c.key).length,
  }));

  const myInProgress = tasks.filter((t) => t.status === "IN_PROGRESS" && t.assignee?.id === user?.id);
  const myOverdue = tasks.filter((t) => isTaskOverdue(t) && t.assignee?.id === user?.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900 dark:text-white">
          Welcome back, {user?.name?.split(" ")[0]}
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {manageScope ? "Here's what's happening across the team." : "Here's what's on your plate."}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {counts.map((c) => (
          <div
            key={c.key}
            className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
          >
            <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${c.color}`}>
              {c.label}
            </span>
            <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">{c.count}</p>
          </div>
        ))}
      </div>

      {!manageScope && myOverdue.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-500/10">
          <h2 className="text-sm font-semibold text-red-700 dark:text-red-400">
            {myOverdue.length} task{myOverdue.length === 1 ? " is" : "s are"} overdue
          </h2>
          <ul className="mt-2 space-y-1">
            {myOverdue.map((t) => (
              <li key={t.id} className="text-sm text-red-600 dark:text-red-300">
                {t.title}
              </li>
            ))}
          </ul>
        </div>
      )}

      {reportsVisible && summary && summary.overdueCount > 0 && (
        <Link
          to="/tasks"
          className="block rounded-xl border border-red-200 bg-red-50 p-4 hover:bg-red-100 dark:border-red-900 dark:bg-red-500/10 dark:hover:bg-red-500/15"
        >
          <h2 className="text-sm font-semibold text-red-700 dark:text-red-400">
            {summary.overdueCount} task{summary.overdueCount === 1 ? " is" : "s are"} overdue across the team
          </h2>
          <p className="mt-0.5 text-xs text-red-600 dark:text-red-300">View all tasks →</p>
        </Link>
      )}

      {!manageScope && myInProgress.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-500/10">
          <h2 className="text-sm font-semibold text-amber-800 dark:text-amber-300">
            You have {myInProgress.length} task{myInProgress.length === 1 ? "" : "s"} in progress
          </h2>
          <ul className="mt-2 space-y-1">
            {myInProgress.map((t) => (
              <li key={t.id} className="text-sm text-amber-700 dark:text-amber-200">
                {t.title}
              </li>
            ))}
          </ul>
        </div>
      )}

      {reportsVisible && summary && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Team workload</h2>
              <Link
                to="/reports"
                className="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
              >
                Full report
              </Link>
            </div>
            {summary.byAssignee.length === 0 ? (
              <p className="text-sm text-slate-400">No assigned tasks yet.</p>
            ) : (
              <ul className="space-y-2">
                {summary.byAssignee.slice(0, 5).map((a) => (
                  <li key={a.userId} className="flex items-center justify-between text-sm">
                    <span className="text-slate-700 dark:text-slate-200">{a.name}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {a.count}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {summary.unassignedCount > 0 && (
              <p className="mt-3 text-xs text-slate-400">{summary.unassignedCount} task(s) unassigned</p>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
              Completed, last 14 days
            </h2>
            <div className="flex h-24 items-end gap-1">
              {summary.completedByDay.map((d) => {
                const max = Math.max(...summary.completedByDay.map((x) => x.count), 1);
                const height = d.count === 0 ? 2 : Math.round((d.count / max) * 100);
                return (
                  <div
                    key={d.date}
                    title={`${d.date}: ${d.count}`}
                    className="flex-1 rounded-sm bg-indigo-500/70 dark:bg-indigo-400/70"
                    style={{ height: `${height}%` }}
                  />
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Recent tasks</h2>
          <Link
            to={manageScope ? "/tasks" : "/my-tasks"}
            className="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
          >
            View all
          </Link>
        </div>

        {loading ? (
          <p className="text-sm text-slate-400">Loading...</p>
        ) : tasks.length === 0 ? (
          <p className="text-sm text-slate-400">No tasks yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {tasks.slice(0, 6).map((task) => (
              <li key={task.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-800 dark:text-slate-100">{task.title}</p>
                  <p className="truncate text-xs text-slate-400">
                    {task.assignee ? `Assigned to ${task.assignee.name}` : "Unassigned"}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                    STAT_CONFIG.find((c) => c.key === task.status)?.color
                  }`}
                >
                  {STAT_CONFIG.find((c) => c.key === task.status)?.label}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
