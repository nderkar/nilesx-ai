import { useCallback, useEffect, useState } from "react";
import { api, type Role } from "../lib/api";
import { RoleFormModal } from "../components/RoleFormModal";
import { IconEdit, IconPlus, IconTrash } from "../components/icons";

const PROTECTED = ["ADMIN", "MANAGER", "MEMBER"];

export function RolesPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);

  const refresh = useCallback(async () => {
    const res = await api.listRoles();
    setRoles(res.roles);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleDelete(role: Role) {
    if (!confirm(`Delete role "${role.name}"? This cannot be undone.`)) return;
    try {
      await api.deleteRole(role.id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete role");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Manage Roles</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            ADMIN, MANAGER, and MEMBER are built-in. Add custom roles as needed.
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500"
        >
          <IconPlus className="h-4 w-4" />
          New role
        </button>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-500/10 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500 dark:bg-slate-800/50 dark:text-slate-400">
            <tr>
              <th className="px-4 py-2.5 font-medium">Name</th>
              <th className="px-4 py-2.5 font-medium">Description</th>
              <th className="px-4 py-2.5 font-medium">Users</th>
              <th className="px-4 py-2.5 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {roles.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-2.5 font-medium text-slate-800 dark:text-slate-100">
                  {r.name}
                  {PROTECTED.includes(r.name) && (
                    <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                      built-in
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400">{r.description || "—"}</td>
                <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400">{r._count?.users ?? 0}</td>
                <td className="px-4 py-2.5">
                  <div className="flex justify-end gap-1">
                    <button
                      onClick={() => setEditingRole(r)}
                      className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
                      title="Edit"
                    >
                      <IconEdit className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(r)}
                      disabled={PROTECTED.includes(r.name)}
                      className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-red-500/10"
                      title="Delete"
                    >
                      <IconTrash className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {creating && (
        <RoleFormModal
          mode="create"
          onClose={() => setCreating(false)}
          onSubmit={async (input) => {
            await api.createRole({ name: input.name!, description: input.description });
            await refresh();
          }}
        />
      )}

      {editingRole && (
        <RoleFormModal
          mode="edit"
          role={editingRole}
          onClose={() => setEditingRole(null)}
          onSubmit={async (input) => {
            await api.updateRole(editingRole.id, input);
            await refresh();
          }}
        />
      )}
    </div>
  );
}
