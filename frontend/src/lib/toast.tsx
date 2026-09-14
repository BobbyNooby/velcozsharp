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

const MAX_VISIBLE_TOASTS = 4;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((toast: Omit<Toast, "id">) => {
    const id = Math.random().toString(36).slice(2, 9);
    // Cap the stack: keep the newest toasts, drop the oldest.
    setToasts((prev) => [...prev, { id, ...toast }].slice(-MAX_VISIBLE_TOASTS));

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
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-80"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onClose={() => removeToast(toast.id)} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  // Theme tokens only, so dark mode stays readable. Variant accents are a
  // left border; success/warning use palette hues with explicit dark: variants
  // since there are no dedicated --success/--warning tokens.
  const variantClasses: Record<ToastVariant, string> = {
    default: "bg-card border",
    success: "bg-card border border-l-4 border-l-green-600 dark:border-l-green-400",
    warning: "bg-card border border-l-4 border-l-yellow-500 dark:border-l-yellow-400",
    destructive: "bg-destructive/10 border-destructive/40 border-l-4 border-l-destructive",
  };

  const isDestructive = toast.variant === "destructive";

  const dismiss = () => {
    toast.onClick?.();
    onClose();
  };

  return (
    <div
      // Errors announce assertively; everything else is a polite status region
      // (declared on the viewport container).
      role={isDestructive ? "alert" : "button"}
      tabIndex={isDestructive ? undefined : 0}
      className={`rounded-lg border shadow-lg p-3 cursor-pointer transition-all hover:shadow-xl text-foreground ${variantClasses[toast.variant ?? "default"]}`}
      onClick={dismiss}
      onKeyDown={
        isDestructive
          ? undefined
          : (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                dismiss();
              }
            }
      }
    >
      <div className="flex justify-between items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium ${isDestructive ? "text-destructive" : ""}`}>
            {toast.title}
          </p>
          {toast.message && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{toast.message}</p>}
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          className="shrink-0 text-muted-foreground hover:text-foreground"
          aria-label="Close"
        >
          ×
        </button>
      </div>
    </div>
  );
}
