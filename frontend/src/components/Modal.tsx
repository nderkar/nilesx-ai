import { useEffect, useState, type ReactNode } from "react";
import { IconX } from "./icons";

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

export function Modal({ title, onClose, children }: ModalProps) {
  // Modals mount/unmount with the parent's conditional render, so there's no
  // "closing" phase to animate out — just a quick fade+scale in on mount,
  // same technique as the toast entrance (start hidden, flip visible a frame
  // later so the transition actually has something to animate from).
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className={`absolute inset-0 bg-slate-900/50 transition-opacity duration-200 ${
          visible ? "opacity-100" : "opacity-0"
        }`}
        onClick={onClose}
      />
      <div
        className={`relative flex w-full max-w-md flex-col rounded-xl border border-slate-200 bg-white shadow-xl transition-all duration-200 ease-out dark:border-slate-700 dark:bg-slate-900 ${
          visible ? "translate-y-0 scale-100 opacity-100" : "translate-y-2 scale-95 opacity-0"
        }`}
        style={{ maxHeight: "85vh" }}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-6 py-4 dark:border-slate-800">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
          >
            <IconX className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-6 py-4">{children}</div>
      </div>
    </div>
  );
}
