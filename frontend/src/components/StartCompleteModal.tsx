import { useState, type FormEvent } from "react";
import { api, type Task } from "../lib/api";
import { Modal } from "./Modal";

interface StartCompleteModalProps {
  task: Task;
  action: "start" | "complete";
  onClose: () => void;
  onSuccess: () => void;
}

export function StartCompleteModal({ task, action, onClose, onSuccess }: StartCompleteModalProps) {
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isStart = action === "start";

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (isStart) {
        await api.startTask(task.id);
      } else {
        await api.completeTask(task.id);
      }
      const trimmed = comment.trim();
      if (trimmed) {
        await api.addComment(task.id, trimmed);
      }
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={isStart ? "Start task" : "Complete task"} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {isStart ? "Starting" : "Completing"}{" "}
          <span className="font-medium text-slate-900 dark:text-white">"{task.title}"</span>
        </p>

        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
            Add a comment (optional)
          </label>
          <textarea
            autoFocus
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            placeholder={
              isStart ? "e.g. Starting now, will flag if blocked" : "e.g. Deployed and verified in staging"
            }
            className="field"
          />
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
            className={`rounded-md px-3 py-1.5 text-sm font-medium text-white transition-colors disabled:opacity-60 ${
              isStart ? "bg-amber-600 hover:bg-amber-500" : "bg-emerald-600 hover:bg-emerald-500"
            }`}
          >
            {saving ? "Saving..." : isStart ? "Start task" : "Mark complete"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
