import React from "react";
import { useToast, type ToastKind } from "../../state/ToastContext";
import { cn } from "../../lib/cn";

const toneMap: Record<ToastKind, { ring: string; dot: string; label: string }> = {
  info: { ring: "ring-neutral-700", dot: "bg-sky-400", label: "Info" },
  success: { ring: "ring-neutral-700", dot: "bg-emerald-400", label: "Success" },
  warn: { ring: "ring-amber-900/60", dot: "bg-amber-400", label: "Warning" },
  error: { ring: "ring-rose-900/60", dot: "bg-rose-500", label: "Error" },
};

export const Toaster: React.FC = () => {
  const { toasts, dismiss } = useToast();
  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[60] flex w-[360px] max-w-[calc(100vw-2rem)] flex-col gap-2">
      {toasts.map((t) => {
        const tone = toneMap[t.kind];
        return (
          <div
            key={t.id}
            role="status"
            className={cn(
              "pointer-events-auto rounded-md border border-neutral-800 bg-neutral-950/95 p-3 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.8)] ring-1 backdrop-blur",
              tone.ring
            )}
            style={{ animation: "toastIn 180ms ease-out" }}
          >
            <div className="flex items-start gap-3">
              <span className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", tone.dot)} aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <div className="text-[13px] font-semibold text-neutral-100">{t.title}</div>
                  <span className="text-[10px] uppercase tracking-[0.14em] text-neutral-600">{tone.label}</span>
                </div>
                {t.message ? (
                  <div className="mt-0.5 break-words text-[12.5px] leading-relaxed text-neutral-400">{t.message}</div>
                ) : null}
              </div>
              <button
                onClick={() => dismiss(t.id)}
                className="-m-1 rounded p-1 text-neutral-600 transition-colors hover:text-neutral-300"
                aria-label="Dismiss"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M2 2l8 8M10 2l-8 8" />
                </svg>
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};
