import { useState, type FormEvent } from "react";
import { Modal } from "./Modal";
import type { Role } from "../lib/api";

interface RoleFormModalProps {
  mode: "create" | "edit";
  role?: Role;
  onClose: () => void;
  onSubmit: (input: { name?: string; description?: string }) => Promise<void>;
}

export function RoleFormModal({ mode, role, onClose, onSubmit }: RoleFormModalProps) {
  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const isProtected = mode === "edit" && ["ADMIN", "MANAGER", "MEMBER"].includes(role?.name ?? "");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSubmit({ name: name.trim(), description: description.trim() || undefined });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={mode === "create" ? "New role" : "Edit role"} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Name</label>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value.toUpperCase())}
            disabled={isProtected}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none disabled:bg-slate-100 disabled:text-slate-400 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:disabled:bg-slate-800/50"
            required
          />
          {isProtected && (
            <p className="text-xs text-slate-400">Built-in role names can't be changed.</p>
          )}
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-white"
          />
        </div>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
          >
            {saving ? "Saving..." : mode === "create" ? "Create role" : "Save changes"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
