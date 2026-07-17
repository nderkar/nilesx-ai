import { useEffect, useState } from "react";
import { api, type ReportSummary, type TaskPriority, type TaskStatus } from "../lib/api";

const STATUS_ORDER: { key: TaskStatus; label: string; bar: string; dot: string }[] = [
  { key: "TODO", label: "To Do", bar: "bg-slate-500 dark:bg-slate-400", dot: "bg-slate-500 dark:bg-slate-400" },
  {
    key: "IN_PROGRESS",
    label: "In Progress",
    bar: "bg-amber-500 dark:bg-amber-400",
    dot: "bg-amber-500 dark:bg-amber-400",
  },
  {
    key: "COMPLETED",
    label: "Completed",
    bar: "bg-emerald-500 dark:bg-emerald-400",
    dot: "bg-emerald-500 dark:bg-emerald-400",
  },
];

const PRIORITY_ORDER: { key: TaskPriority; label: string; bar: string }[] = [
  { key: "HIGH", label: "High", bar: "bg-red-600 dark:bg-red-500" },
  { key: "MEDIUM", label: "Medium", bar: "bg-amber-500 dark:bg-amber-400" },
  { key: "LOW", label: "Low", bar: "bg-slate-500 dark:bg-slate-400" },
];

function formatDayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatHours(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 48) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-1 text-3xl font-semibold text-slate-900 dark:text-white">
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
    </div>
  );
}

function StatusChart({ summary }: { summary: ReportSummary }) {
  const [hover, setHover] = useState<TaskStatus | null>(null);
  const max = Math.max(...STATUS_ORDER.map((s) => summary.byStatus[s.key] ?? 0), 1);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="mb-4 text-sm font-semibold text-slate-700 dark:text-slate-200">Tasks by status</h2>
      <div className="flex h-40 items-end justify-center gap-8">
        {STATUS_ORDER.map((s) => {
          const value = summary.byStatus[s.key] ?? 0;
          const heightPct = value === 0 ? 2 : Math.round((value / max) * 100);
          return (
            <div key={s.key} className="flex flex-col items-center gap-2">
              <div className="relative flex h-32 w-8 items-end justify-center">
                {hover === s.key && (
                  <div className="absolute -top-8 z-10 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-xs font-medium text-white shadow-lg dark:bg-slate-700">
                    {value.toLocaleString()}
                  </div>
                )}
                <div
                  role="img"
                  aria-label={`${s.label}: ${value}`}
                  tabIndex={0}
                  onMouseEnter={() => setHover(s.key)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(s.key)}
                  onBlur={() => setHover(null)}
                  className={`w-6 rounded-t-[4px] outline-none transition-[filter] hover:brightness-110 focus-visible:ring-2 focus-visible:ring-indigo-500 ${s.bar}`}
                  style={{ height: `${heightPct}%` }}
                />
              </div>
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{s.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PriorityChart({ summary }: { summary: ReportSummary }) {
  const [hover, setHover] = useState<TaskPriority | null>(null);
  const max = Math.max(...PRIORITY_ORDER.map((p) => summary.byPriority[p.key] ?? 0), 1);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="mb-4 text-sm font-semibold text-slate-700 dark:text-slate-200">Tasks by priority</h2>
      <div className="flex h-40 items-end justify-center gap-8">
        {PRIORITY_ORDER.map((p) => {
          const value = summary.byPriority[p.key] ?? 0;
          const heightPct = value === 0 ? 2 : Math.round((value / max) * 100);
          return (
            <div key={p.key} className="flex flex-col items-center gap-2">
              <div className="relative flex h-32 w-8 items-end justify-center">
                {hover === p.key && (
                  <div className="absolute -top-8 z-10 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-xs font-medium text-white shadow-lg dark:bg-slate-700">
                    {value.toLocaleString()}
                  </div>
                )}
                <div
                  role="img"
                  aria-label={`${p.label}: ${value}`}
                  tabIndex={0}
                  onMouseEnter={() => setHover(p.key)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(p.key)}
                  onBlur={() => setHover(null)}
                  className={`w-6 rounded-t-[4px] outline-none transition-[filter] hover:brightness-110 focus-visible:ring-2 focus-visible:ring-indigo-500 ${p.bar}`}
                  style={{ height: `${heightPct}%` }}
                />
              </div>
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{p.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AssigneeChart({ summary }: { summary: ReportSummary }) {
  const [hover, setHover] = useState<string | null>(null);
  const rows = summary.byAssignee;
  const max = Math.max(...rows.map((r) => r.count), 1);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="mb-4 text-sm font-semibold text-slate-700 dark:text-slate-200">Tasks by assignee</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-400">No assigned tasks yet.</p>
      ) : (
        <div className="space-y-2.5">
          {rows.map((r) => {
            const widthPct = Math.max(Math.round((r.count / max) * 100), 4);
            return (
              <div key={r.userId} className="flex items-center gap-3">
                <span className="w-28 shrink-0 truncate text-xs font-medium text-slate-600 dark:text-slate-300">
                  {r.name}
                </span>
                <div className="relative h-5 flex-1">
                  <div
                    role="img"
                    aria-label={`${r.name}: ${r.count}`}
                    tabIndex={0}
                    onMouseEnter={() => setHover(r.userId)}
                    onMouseLeave={() => setHover(null)}
                    onFocus={() => setHover(r.userId)}
                    onBlur={() => setHover(null)}
                    className="h-full max-h-6 rounded-r-[4px] bg-indigo-500 outline-none transition-[filter] hover:brightness-110 focus-visible:ring-2 focus-visible:ring-indigo-500 dark:bg-indigo-400"
                    style={{ width: `${widthPct}%` }}
                  />
                  {hover === r.userId && (
                    <div className="absolute -top-8 left-0 z-10 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-xs font-medium text-white shadow-lg dark:bg-slate-700">
                      {r.count.toLocaleString()}
                    </div>
                  )}
                </div>
                <span className="w-6 shrink-0 text-right text-xs text-slate-400">{r.count}</span>
              </div>
            );
          })}
        </div>
      )}
      {summary.unassignedCount > 0 && (
        <p className="mt-3 text-xs text-slate-400">{summary.unassignedCount} task(s) unassigned</p>
      )}
    </div>
  );
}

function TrendChart({ summary }: { summary: ReportSummary }) {
  const [hover, setHover] = useState<string | null>(null);
  const days = summary.completedByDay;
  const max = Math.max(...days.map((d) => d.count), 1);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 sm:col-span-2">
      <h2 className="mb-4 text-sm font-semibold text-slate-700 dark:text-slate-200">
        Completed tasks — last 14 days
      </h2>
      <div className="flex h-40 items-end gap-1.5">
        {days.map((d, i) => {
          const heightPct = d.count === 0 ? 2 : Math.round((d.count / max) * 100);
          const showLabel = i === 0 || i === days.length - 1 || i % 3 === 0;
          return (
            <div key={d.date} className="flex flex-1 flex-col items-center gap-1.5">
              <div className="relative flex h-32 w-full items-end justify-center">
                {hover === d.date && (
                  <div className="absolute -top-9 z-10 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-xs font-medium text-white shadow-lg dark:bg-slate-700">
                    <span className="font-semibold">{d.count}</span> on {formatDayLabel(d.date)}
                  </div>
                )}
                <div
                  role="img"
                  aria-label={`${formatDayLabel(d.date)}: ${d.count}`}
                  tabIndex={0}
                  onMouseEnter={() => setHover(d.date)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(d.date)}
                  onBlur={() => setHover(null)}
                  className="w-full max-w-[22px] rounded-t-[4px] bg-indigo-500 outline-none transition-[filter] hover:brightness-110 focus-visible:ring-2 focus-visible:ring-indigo-500 dark:bg-indigo-400"
                  style={{ height: `${heightPct}%` }}
                />
              </div>
              <span className="text-[10px] text-slate-400">{showLabel ? formatDayLabel(d.date) : ""}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DataTable({ summary }: { summary: ReportSummary }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">Raw data</h2>
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="text-slate-400">
            <th className="pb-2 pr-4 font-medium">Status</th>
            <th className="pb-2 font-medium">Count</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {STATUS_ORDER.map((s) => (
            <tr key={s.key}>
              <td className="py-1.5 pr-4 text-slate-700 dark:text-slate-200">{s.label}</td>
              <td className="py-1.5 tabular-nums text-slate-700 dark:text-slate-200">
                {summary.byStatus[s.key] ?? 0}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <table className="mt-4 w-full text-left text-xs">
        <thead>
          <tr className="text-slate-400">
            <th className="pb-2 pr-4 font-medium">Priority</th>
            <th className="pb-2 font-medium">Count</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {PRIORITY_ORDER.map((p) => (
            <tr key={p.key}>
              <td className="py-1.5 pr-4 text-slate-700 dark:text-slate-200">{p.label}</td>
              <td className="py-1.5 tabular-nums text-slate-700 dark:text-slate-200">
                {summary.byPriority[p.key] ?? 0}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <table className="mt-4 w-full text-left text-xs">
        <thead>
          <tr className="text-slate-400">
            <th className="pb-2 pr-4 font-medium">Assignee</th>
            <th className="pb-2 font-medium">Count</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {summary.byAssignee.map((a) => (
            <tr key={a.userId}>
              <td className="py-1.5 pr-4 text-slate-700 dark:text-slate-200">{a.name}</td>
              <td className="py-1.5 tabular-nums text-slate-700 dark:text-slate-200">{a.count}</td>
            </tr>
          ))}
          <tr>
            <td className="py-1.5 pr-4 text-slate-700 dark:text-slate-200">Unassigned</td>
            <td className="py-1.5 tabular-nums text-slate-700 dark:text-slate-200">
              {summary.unassignedCount}
            </td>
          </tr>
        </tbody>
      </table>

      <table className="mt-4 w-full text-left text-xs">
        <thead>
          <tr className="text-slate-400">
            <th className="pb-2 pr-4 font-medium">Date</th>
            <th className="pb-2 font-medium">Completed</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {summary.completedByDay.map((d) => (
            <tr key={d.date}>
              <td className="py-1.5 pr-4 text-slate-700 dark:text-slate-200">{formatDayLabel(d.date)}</td>
              <td className="py-1.5 tabular-nums text-slate-700 dark:text-slate-200">{d.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ReportsPage() {
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showTable, setShowTable] = useState(false);

  useEffect(() => {
    api
      .getReportSummary()
      .then(setSummary)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load report"));
  }, []);

  const totalTasks = summary
    ? Object.values(summary.byStatus).reduce((sum, n) => sum + n, 0)
    : 0;
  const completedRecently = summary
    ? summary.completedByDay.reduce((sum, d) => sum + d.count, 0)
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Reports</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Task status, workload, and completion trend across the team.
          </p>
        </div>
        {summary && (
          <button
            onClick={() => setShowTable((v) => !v)}
            className="shrink-0 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            {showTable ? "Show charts" : "View as table"}
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-500/10 dark:text-red-400">
          {error}
        </div>
      )}

      {!summary && !error && <p className="text-sm text-slate-400">Loading...</p>}

      {summary && (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            <StatTile label="Total tasks" value={totalTasks} />
            <StatTile label="Unassigned" value={summary.unassignedCount} />
            <StatTile label="Overdue" value={summary.overdueCount} />
            <StatTile label="Completed, last 14 days" value={completedRecently} />
            <StatTile
              label="Avg. time to complete"
              value={summary.avgCompletionHours === null ? "—" : formatHours(summary.avgCompletionHours)}
            />
          </div>

          {showTable ? (
            <DataTable summary={summary} />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <StatusChart summary={summary} />
              <PriorityChart summary={summary} />
              <AssigneeChart summary={summary} />
              <TrendChart summary={summary} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
