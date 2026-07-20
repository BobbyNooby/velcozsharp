"use client";

import { createContext, useCallback, useContext, useState, ReactNode } from "react";

export type ToastVariant = "default" | "success" | "warning" | "destructive";

export type Toast = {
  id: string;
  title: string;
  message?: string;
  variant?: ToastVariant;
  duration?: number;
  link?: string;
  onClick?: () => void;
};

type ToastContextValue = {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, "id">) => void;
  removeToast: (id: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((toast: Omit<Toast, "id">) => {
    const id = Math.random().toString(36).slice(2, 9);
    setToasts((prev) => [...prev, { id, ...toast }]);

    const duration = toast.duration ?? 5000;
    if (duration > 0) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, duration);
    }
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      <ToastContainer />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

function ToastContainer() {
  const { toasts, removeToast } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-80">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onClose={() => removeToast(toast.id)} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const variantClasses: Record<ToastVariant, string> = {
    default: "bg-white border-gray-200",
    success: "bg-green-50 border-green-200",
    warning: "bg-yellow-50 border-yellow-200",
    destructive: "bg-red-50 border-red-200",
  };

  return (
    <div
      className={`rounded-lg border shadow-lg p-3 cursor-pointer transition-all hover:shadow-xl ${variantClasses[toast.variant ?? "default"]}`}
      onClick={() => {
        toast.onClick?.();
        onClose();
      }}
      role="button"
    >
      <div className="flex justify-between items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">{toast.title}</p>
          {toast.message && <p className="text-xs text-gray-600 mt-0.5 line-clamp-2">{toast.message}</p>}
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          className="text-gray-400 hover:text-gray-600"
          aria-label="Close"
        >
          ×
        </button>
      </div>
    </div>
  );
}
