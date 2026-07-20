import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { IconCheck, IconX } from "./icons";

type ToastKind = "success" | "error";

interface ToastItem {
  id: string;
  message: string;
  kind: ToastKind;
}

interface ToastContextValue {
  showToast: (message: string, kind?: ToastKind) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const AUTO_DISMISS_MS = 3000;

function ToastItemView({ toast, onDismiss }: { toast: ToastItem; onDismiss: () => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      role="status"
      className={`pointer-events-auto flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-black/10 transition-all duration-200 ${
        visible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
      } ${toast.kind === "success" ? "bg-emerald-600" : "bg-red-600"}`}
    >
      {toast.kind === "success" ? (
        <IconCheck className="h-4 w-4 shrink-0" />
      ) : (
        <IconX className="h-4 w-4 shrink-0" />
      )}
      <span>{toast.message}</span>
      <button
        onClick={onDismiss}
        className="ml-1 shrink-0 rounded-full p-0.5 hover:bg-white/20"
        aria-label="Dismiss"
      >
        <IconX className="h-3 w-3" />
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const showToast = useCallback(
    (message: string, kind: ToastKind = "success") => {
      const id = crypto.randomUUID();
      setToasts((prev) => [...prev, { id, message, kind }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), AUTO_DISMISS_MS),
      );
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <ToastItemView key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
