import { useEffect, useState } from "react";
import { api, type ActivityLogEntry } from "../lib/api";

const CLIENT_LABELS: Record<string, { label: string; color: string }> = {
  web: { label: "Web", color: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" },
  cli: { label: "CLI", color: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300" },
  "mcp-stdio": {
    label: "MCP (Desktop/Code)",
    color: "bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300",
  },
  "mcp-http": {
    label: "MCP (network)",
    color: "bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300",
  },
};

function statusColor(status: number): string {
  if (status >= 200 && status < 300) {
    return "text-emerald-600 dark:text-emerald-400";
  }
  if (status >= 400 && status < 500) {
    return "text-amber-600 dark:text-amber-400";
  }
  return "text-red-600 dark:text-red-400";
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffSec = Math.round(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return new Date(iso).toLocaleString();
}

export function ActivityLogPage() {
  const [entries, setEntries] = useState<ActivityLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.listActivityLog().then((res) => {
      setEntries(res.entries);
      setLoading(false);
    });
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900 dark:text-white">Activity Log</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Every mutating action across the web dashboard, the CLI, and MCP tool calls — including
          denied attempts. They all funnel through the same backend API, so this is a single,
          unified audit trail.
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500 dark:bg-slate-800/50 dark:text-slate-400">
            <tr>
              <th className="px-4 py-2.5 font-medium">When</th>
              <th className="px-4 py-2.5 font-medium">Actor</th>
              <th className="px-4 py-2.5 font-medium">Via</th>
              <th className="px-4 py-2.5 font-medium">Action</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                  Loading...
                </td>
              </tr>
            ) : entries.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                  No activity recorded yet.
                </td>
              </tr>
            ) : (
              entries.map((e) => {
                const client = CLIENT_LABELS[e.client] ?? {
                  label: e.client,
                  color: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
                };
                return (
                  <tr key={e.id}>
                    <td className="whitespace-nowrap px-4 py-2.5 text-xs text-slate-400" title={e.createdAt}>
                      {relativeTime(e.createdAt)}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="text-slate-800 dark:text-slate-100">{e.actorName}</div>
                      <div className="text-xs text-slate-400">{e.actorRole}</div>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${client.color}`}>
                        {client.label}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-700 dark:text-slate-200">
                      {e.description}
                      <span className="ml-2 text-xs text-slate-400">
                        {e.method} {e.path}
                      </span>
                    </td>
                    <td className={`px-4 py-2.5 text-xs font-medium ${statusColor(e.statusCode)}`}>
                      {e.statusCode}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
