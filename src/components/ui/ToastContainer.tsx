"use client";

import React from "react";
import { useGameStore, type ToastInfo } from "@/store/useGameStore";

const TOAST_META = {
  success: { icon: "✓", label: "成功" },
  error: { icon: "!", label: "錯誤" },
  warning: { icon: "⚠", label: "注意" },
  info: { icon: "i", label: "提示" },
} satisfies Record<ToastInfo["type"], { icon: string; label: string }>;

export default function ToastContainer() {
  const toasts = useGameStore((state) => state.toasts);
  const removeToast = useGameStore((state) => state.removeToast);

  if (toasts.length === 0) return null;

  return (
    <div className="toast-container" aria-live="polite" aria-atomic="false">
      {toasts.slice(-2).map((toast, index) => {
        const meta = TOAST_META[toast.type];
        const tiltClass = index % 2 === 0 ? "toast-item--tilt-left" : "toast-item--tilt-right";

        return (
          <div
            key={toast.id}
            className={`toast-item toast-item--${toast.type} ${tiltClass}`}
            role={toast.type === "error" || toast.type === "warning" ? "alert" : "status"}
          >
            <span className="toast-item__stripe" aria-hidden="true" />
            <div className="toast-item__icon" aria-hidden="true">
              {meta.icon}
            </div>
            <div className="toast-item__body">
              <div className="toast-item__meta">
                <span>{meta.label}</span>
                <span className="toast-item__dot" aria-hidden="true">•</span>
                <span>CardDuel</span>
              </div>
              <p className="toast-item__message">{toast.message}</p>
              {toast.suggestedType && (
                <div className="toast-item__hint">
                  <span className="toast-item__hint-label">建議牌型</span>
                  <span className="toast-item__hint-value">{toast.suggestedType}</span>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => removeToast(toast.id)}
              className="toast-item__close"
              aria-label="Close notification"
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
