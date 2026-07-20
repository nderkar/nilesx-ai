import { useEffect, useState } from "react";
import {
  api,
  isTaskOverdue,
  type Comment,
  type Task,
  type TaskHistoryEntry,
  type TaskPriority,
} from "../lib/api";
import { useAuth } from "../lib/auth";
import { Modal } from "./Modal";

const ACTION_STYLE: Record<string, { label: string; dot: string }> = {
  CREATED: { label: "Created", dot: "bg-slate-400" },
  ASSIGNED: { label: "Assigned", dot: "bg-indigo-500" },
  REASSIGNED: { label: "Reassigned", dot: "bg-indigo-500" },
  STARTED: { label: "Started", dot: "bg-amber-500" },
  COMPLETED: { label: "Completed", dot: "bg-emerald-500" },
  UPDATED: { label: "Updated", dot: "bg-slate-400" },
};

const STATUS_BADGE: Record<string, string> = {
  TODO: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  IN_PROGRESS: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
  COMPLETED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
};

const PRIORITY_BADGE: Record<TaskPriority, string> = {
  HIGH: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400",
  MEDIUM: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
  LOW: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
};

const PRIORITY_LABEL: Record<TaskPriority, string> = { HIGH: "High", MEDIUM: "Medium", LOW: "Low" };

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatDuration(startIso: string, endIso: string): string {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  if (hours < 24) return `${hours}h ${remMinutes}m`;
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return `${days}d ${remHours}h`;
}

function describeHistoryEntry(entry: TaskHistoryEntry): string {
  const style = ACTION_STYLE[entry.action] ?? { label: entry.action };
  if (entry.note) return entry.note;
  return `${style.label} by ${entry.actor.name}`;
}

type TaskWithDetail = Task & { history: TaskHistoryEntry[]; comments: Comment[] };

export function TaskDetailModal({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const { user } = useAuth();
  const [task, setTask] = useState<TaskWithDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [commentBody, setCommentBody] = useState("");
  const [postingComment, setPostingComment] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);

  function load() {
    api
      .getTask(taskId)
      .then((res) => setTask(res.task))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load task"));
  }

  useEffect(() => {
    let cancelled = false;
    api
      .getTask(taskId)
      .then((res) => {
        if (!cancelled) setTask(res.task);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load task");
      });
    return () => {
      cancelled = true;
    };
  }, [taskId]);

  const canComment = task && user && (task.assignee?.id === user.id || user.role === "ADMIN" || user.role === "MANAGER");

  async function handleAddComment() {
    if (!commentBody.trim()) return;
    setPostingComment(true);
    setCommentError(null);
    try {
      await api.addComment(taskId, commentBody.trim());
      setCommentBody("");
      load();
    } catch (err) {
      setCommentError(err instanceof Error ? err.message : "Failed to add comment");
    } finally {
      setPostingComment(false);
    }
  }

  return (
    <Modal title="Task details" onClose={onClose}>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {!task && !error && <p className="text-sm text-slate-400">Loading...</p>}

      {task && (
        <div className="space-y-5">
          <div>
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{task.title}</h3>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[task.status]}`}>
                {task.status.replace("_", " ")}
              </span>
            </div>
            {task.description && (
              <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">{task.description}</p>
            )}

            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${PRIORITY_BADGE[task.priority]}`}>
                {PRIORITY_LABEL[task.priority]} priority
              </span>
              {task.dueDate && (
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    isTaskOverdue(task)
                      ? "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400"
                      : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                  }`}
                >
                  {isTaskOverdue(task) ? "Overdue — was due " : "Due "}
                  {formatDate(task.dueDate)}
                </span>
              )}
            </div>

            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-slate-500 dark:text-slate-400">
              <dt className="font-medium text-slate-400 dark:text-slate-500">Created by</dt>
              <dd>{task.createdBy.name}</dd>
              <dt className="font-medium text-slate-400 dark:text-slate-500">Assignee</dt>
              <dd>{task.assignee ? task.assignee.name : "Unassigned"}</dd>
              <dt className="font-medium text-slate-400 dark:text-slate-500">Created</dt>
              <dd>{formatTimestamp(task.createdAt)}</dd>
              {task.startedAt && (
                <>
                  <dt className="font-medium text-slate-400 dark:text-slate-500">Started</dt>
                  <dd>{formatTimestamp(task.startedAt)}</dd>
                </>
              )}
              {task.completedAt && (
                <>
                  <dt className="font-medium text-slate-400 dark:text-slate-500">Completed</dt>
                  <dd>{formatTimestamp(task.completedAt)}</dd>
                </>
              )}
              {task.startedAt && task.completedAt && (
                <>
                  <dt className="font-medium text-slate-400 dark:text-slate-500">Time taken</dt>
                  <dd>{formatDuration(task.startedAt, task.completedAt)}</dd>
                </>
              )}
            </dl>
          </div>

          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
              History
            </h4>
            {task.history.length === 0 ? (
              <p className="text-sm text-slate-400">No history yet.</p>
            ) : (
              <ol className="max-h-52 space-y-0 overflow-y-auto pr-1">
                {[...task.history].reverse().map((entry, i) => {
                  const style = ACTION_STYLE[entry.action] ?? { label: entry.action, dot: "bg-slate-400" };
                  const isLast = i === task.history.length - 1;
                  return (
                    <li key={entry.id} className="relative flex gap-3 pb-4">
                      {!isLast && (
                        <span className="absolute left-[5px] top-3 h-full w-px bg-slate-200 dark:bg-slate-700" />
                      )}
                      <span className={`relative mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${style.dot}`} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-slate-700 dark:text-slate-200">
                          {describeHistoryEntry(entry)}
                        </p>
                        <p className="text-xs text-slate-400">{formatTimestamp(entry.createdAt)}</p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>

          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
              Comments
            </h4>
            {task.comments.length === 0 ? (
              <p className="text-sm text-slate-400">No comments yet.</p>
            ) : (
              <ul className="max-h-52 space-y-3 overflow-y-auto pr-1">
                {task.comments.map((c) => (
                  <li key={c.id} className="rounded-md bg-slate-50 p-2.5 dark:bg-slate-800/60">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                        {c.author.name}
                      </span>
                      <span className="text-xs text-slate-400">{formatTimestamp(c.createdAt)}</span>
                    </div>
                    <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">{c.body}</p>
                  </li>
                ))}
              </ul>
            )}

            {canComment && (
              <div className="mt-3 space-y-2">
                <textarea
                  value={commentBody}
                  onChange={(e) => setCommentBody(e.target.value)}
                  placeholder="Add a comment..."
                  rows={2}
                  className="field"
                />
                {commentError && <p className="text-xs text-red-600 dark:text-red-400">{commentError}</p>}
                <div className="flex justify-end">
                  <button
                    onClick={handleAddComment}
                    disabled={postingComment || !commentBody.trim()}
                    className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-60"
                  >
                    {postingComment ? "Posting..." : "Post comment"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
