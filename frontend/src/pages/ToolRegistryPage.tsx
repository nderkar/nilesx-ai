import { useCallback, useEffect, useState } from "react";
import { api, type ToolSetting } from "../lib/api";

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
        checked ? "bg-indigo-600" : "bg-slate-300 dark:bg-slate-700"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}

const CATEGORY_ORDER = ["Tasks", "Users", "Roles"];

export function ToolRegistryPage() {
  const [tools, setTools] = useState<ToolSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await api.listToolSettings();
    setTools(res.tools);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function toggle(tool: ToolSetting) {
    setError(null);
    try {
      await api.setToolEnabled(tool.name, !tool.enabled);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update tool setting");
    }
  }

  const categories = CATEGORY_ORDER.filter((c) => tools.some((t) => t.category === c));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900 dark:text-white">Tool Registry</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Every operation Nilex AI exposes through MCP (Claude Desktop/Code) and the{" "}
          <code className="rounded bg-slate-100 px-1 py-0.5 text-xs dark:bg-slate-800">nilex</code> CLI.
          Disabling a tool here takes effect the next time a session logs in — it doesn't affect the
          web dashboard, only AI/CLI access.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-500/10 dark:text-red-400">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-slate-400">Loading...</p>
      ) : tools.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 py-10 text-center text-sm text-slate-400 dark:border-slate-700">
          No tools synced yet — start the Nilex AI MCP server (<code>npm run mcp:stdio</code> or{" "}
          <code>npm run mcp:http</code> in <code>nilex-ai/</code>) to populate this list.
        </p>
      ) : (
        categories.map((category) => (
          <div
            key={category}
            className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
          >
            <h2 className="border-b border-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-700 dark:border-slate-800 dark:text-slate-200">
              {category}
            </h2>
            <table className="w-full text-left text-sm">
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {tools
                  .filter((t) => t.category === category)
                  .map((tool) => (
                    <tr key={tool.id}>
                      <td className="w-56 px-4 py-3 align-top">
                        <code className="text-xs font-medium text-slate-800 dark:text-slate-100">
                          {tool.name}
                        </code>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {(tool.requiredRoles.length ? tool.requiredRoles : ["any logged-in user"]).map(
                            (r) => (
                              <span
                                key={r}
                                className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                              >
                                {r}
                              </span>
                            ),
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top text-slate-500 dark:text-slate-400">
                        {tool.description}
                      </td>
                      <td className="w-16 px-4 py-3 align-top">
                        <ToggleSwitch checked={tool.enabled} onChange={() => toggle(tool)} />
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ))
      )}
    </div>
  );
}
