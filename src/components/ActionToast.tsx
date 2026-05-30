"use client";

import { X } from "lucide-react";

export default function ActionToast({
  message,
  actionLabel,
  onAction,
  onDismiss,
}: {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-[60] flex justify-center px-4 pb-6 pt-2 pointer-events-none">
      <div className="pointer-events-auto w-full max-w-md bg-card border border-border rounded-xl shadow-2xl p-4 flex items-start gap-3">
        <p className="flex-1 text-sm text-foreground leading-snug">{message}</p>
        {actionLabel && onAction && (
          <button
            onClick={onAction}
            className="shrink-0 px-3 py-1.5 text-xs font-medium text-white bg-accent rounded-lg hover:bg-accent/90 transition-colors"
          >
            {actionLabel}
          </button>
        )}
        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          className="shrink-0 p-1 text-muted hover:text-foreground transition-colors"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
