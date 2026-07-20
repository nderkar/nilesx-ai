import { useState, type FormEvent } from "react";
import { Modal } from "./Modal";
import type { Role, User } from "../lib/api";

interface UserFormModalProps {
  mode: "create" | "edit";
  user?: User;
  roles: Role[];
  onClose: () => void;
  onSubmit: (input: { name?: string; email?: string; password?: string; roleName?: string }) => Promise<void>;
}

export function UserFormModal({ mode, user, roles, onClose, onSubmit }: UserFormModalProps) {
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [password, setPassword] = useState("");
  const [roleName, setRoleName] = useState(user?.role.name ?? roles[0]?.name ?? "MEMBER");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (mode === "create") {
        await onSubmit({ name, email, password, roleName });
      } else {
        await onSubmit({ name, email, roleName });
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={mode === "create" ? "New user" : "Edit user"} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Name</label>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="field"
            required
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="field"
            required
          />
        </div>

        {mode === "create" && (
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
              Temporary password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              className="field"
              required
            />
          </div>
        )}

        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Role</label>
          <select
            value={roleName}
            onChange={(e) => setRoleName(e.target.value)}
            className="field"
          >
            {roles.map((r) => (
              <option key={r.id} value={r.name}>
                {r.name}
              </option>
            ))}
          </select>
        </div>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-60"
          >
            {saving ? "Saving..." : mode === "create" ? "Create user" : "Save changes"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
