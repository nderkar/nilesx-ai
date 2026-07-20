import { useState, type FormEvent } from "react";
import { Modal } from "./Modal";
import type { Task, TaskPriority, User } from "../lib/api";

interface TaskFormModalProps {
  mode: "create" | "edit";
  task?: Task;
  users: User[];
  onClose: () => void;
  onSubmit: (input: {
    title: string;
    description?: string;
    assigneeId?: string;
    priority?: TaskPriority;
    dueDate?: string | null;
  }) => Promise<void>;
}

function toDateInputValue(iso?: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

export function TaskFormModal({ mode, task, users, onClose, onSubmit }: TaskFormModalProps) {
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [assigneeId, setAssigneeId] = useState(task?.assignee?.id ?? "");
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? "MEDIUM");
  const [dueDate, setDueDate] = useState(toDateInputValue(task?.dueDate));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        title: title.trim(),
        description: description.trim() || undefined,
        assigneeId: assigneeId || undefined,
        priority,
        dueDate: dueDate ? `${dueDate}T00:00:00.000Z` : null,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={mode === "create" ? "New task" : "Edit task"} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Title</label>
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="field"
            required
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="field"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Priority</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as TaskPriority)}
              className="field"
            >
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Due date</label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="field"
            />
          </div>
        </div>

        {mode === "create" && (
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Assign to</label>
            <select
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
              className="field"
            >
              <option value="">Unassigned</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
        )}

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
            {saving ? "Saving..." : mode === "create" ? "Create task" : "Save changes"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
