import React, { useEffect } from "react";
import { cn } from "../../lib/cn";

export const Modal: React.FC<{
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg";
  tone?: "default" | "danger";
}> = ({ open, onClose, title, children, footer, size = "md", tone = "default" }) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const widths = { sm: "max-w-md", md: "max-w-xl", lg: "max-w-3xl" };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-[fadeIn_140ms_ease-out]"
        onClick={onClose}
      />
      <div
        className={cn(
          "relative w-full overflow-hidden rounded-lg border bg-neutral-950 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)]",
          "animate-[popIn_180ms_ease-out]",
          tone === "danger" ? "border-red-900/60" : "border-neutral-800",
          widths[size]
        )}
      >
        {title ? (
          <div className="flex items-center justify-between gap-4 border-b border-neutral-900 px-5 py-4">
            <h3 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-neutral-300">{title}</h3>
            <button onClick={onClose} className="text-neutral-500 hover:text-neutral-200" aria-label="Close">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        ) : null}
        <div className="px-5 py-5 text-sm text-neutral-300">{children}</div>
        {footer ? (
          <div className="flex items-center justify-end gap-2 border-t border-neutral-900 bg-neutral-950/80 px-5 py-3">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
};
