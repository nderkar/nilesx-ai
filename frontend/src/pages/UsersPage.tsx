import { useCallback, useEffect, useState } from "react";
import { api, type Role, type User } from "../lib/api";
import { useAuth } from "../lib/auth";
import { roleLabel } from "../lib/permissions";
import { UserFormModal } from "../components/UserFormModal";
import { IconEdit, IconPlus, IconTrash } from "../components/icons";

export function UsersPage() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  const refresh = useCallback(async () => {
    const [userRes, roleRes] = await Promise.all([api.listUsers(), api.listRoles()]);
    setUsers(userRes.users);
    setRoles(roleRes.roles);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleDelete(user: User) {
    if (!confirm(`Delete ${user.name}? This cannot be undone.`)) return;
    try {
      await api.deleteUser(user.id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete user");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Manage Users</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Create, update, and remove workspace members.
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500"
        >
          <IconPlus className="h-4 w-4" />
          New user
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
              <th className="px-4 py-2.5 font-medium">Email</th>
              <th className="px-4 py-2.5 font-medium">Role</th>
              <th className="px-4 py-2.5 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {users.map((u) => (
              <tr key={u.id}>
                <td className="px-4 py-2.5 text-slate-800 dark:text-slate-100">
                  {u.name}
                  {u.id === me?.id && (
                    <span className="ml-2 rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">
                      you
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400">{u.email}</td>
                <td className="px-4 py-2.5">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    {roleLabel(u.role.name)}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex justify-end gap-1">
                    <button
                      onClick={() => setEditingUser(u)}
                      className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
                      title="Edit"
                    >
                      <IconEdit className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(u)}
                      disabled={u.id === me?.id}
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
        <UserFormModal
          mode="create"
          roles={roles}
          onClose={() => setCreating(false)}
          onSubmit={async (input) => {
            await api.createUser({
              name: input.name!,
              email: input.email!,
              password: input.password!,
              roleName: input.roleName!,
            });
            await refresh();
          }}
        />
      )}

      {editingUser && (
        <UserFormModal
          mode="edit"
          user={editingUser}
          roles={roles}
          onClose={() => setEditingUser(null)}
          onSubmit={async (input) => {
            await api.updateUser(editingUser.id, input);
            await refresh();
          }}
        />
      )}
    </div>
  );
}
