import React, { useEffect } from "react";
import { cn } from "../../lib/cn";
import { Button } from "./Button";

export type ConfirmTone = "default" | "danger" | "warn";

export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
  destructive?: boolean;
  loading?: boolean;
}

const toneAccent: Record<ConfirmTone, string> = {
  default: "border-neutral-800",
  warn: "border-amber-900/70",
  danger: "border-rose-900/70",
};

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "default",
  destructive,
  loading,
}) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loading) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, loading, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ animation: "fadeIn 140ms ease-out" }}
    >
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={() => (loading ? null : onClose())}
        aria-hidden
      />
      <div
        className={cn(
          "relative w-full max-w-md rounded-md border bg-neutral-950 shadow-[0_20px_60px_-10px_rgba(0,0,0,0.9)]",
          toneAccent[tone],
          destructive && "ring-1 ring-rose-900/40"
        )}
        style={{ animation: "toastIn 180ms ease-out" }}
      >
        <div className="border-b border-neutral-900 px-5 py-3.5">
          <div className="flex items-center gap-2">
            {tone === "danger" || destructive ? (
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden />
            ) : tone === "warn" ? (
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400" aria-hidden />
            ) : null}
            <h2 className="text-[13.5px] font-semibold text-neutral-100">{title}</h2>
          </div>
        </div>
        {description ? (
          <div className="px-5 py-4 text-[12.5px] leading-relaxed text-neutral-300">{description}</div>
        ) : null}
        <div className="flex items-center justify-end gap-2 border-t border-neutral-900 px-5 py-3">
          <Button variant="ghost" size="md" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            variant={destructive || tone === "danger" ? "danger" : "primary"}
            size="md"
            onClick={onConfirm}
            loading={loading}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
};
