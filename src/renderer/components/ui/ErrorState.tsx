import React from "react";
import { Button } from "./Button";

export interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = "Something went wrong",
  message,
  onRetry,
  retryLabel = "Retry",
}) => (
  <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
    <div className="flex h-10 w-10 items-center justify-center rounded-full border border-rose-900/60 bg-rose-950/30 text-rose-400">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M12 9v4M12 17h.01" />
        <path d="M10.3 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      </svg>
    </div>
    <div className="max-w-md space-y-1">
      <div className="text-[13px] font-semibold text-neutral-200">{title}</div>
      <div className="break-words font-mono text-[12px] leading-relaxed text-rose-300/90">{message}</div>
    </div>
    {onRetry ? (
      <Button variant="outline" size="sm" onClick={onRetry} className="mt-1">
        {retryLabel}
      </Button>
    ) : null}
  </div>
);
