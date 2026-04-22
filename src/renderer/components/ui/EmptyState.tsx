import React from "react";
import { cn } from "../../lib/cn";

export type EmptyTone = "default" | "success" | "muted";

export interface EmptyStateProps {
  title: string;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  tone?: EmptyTone;
  className?: string;
}

const toneRing: Record<EmptyTone, string> = {
  default: "text-neutral-600",
  success: "text-emerald-500/70",
  muted: "text-neutral-700",
};

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  icon,
  action,
  tone = "default",
  className,
}) => (
  <div
    className={cn(
      "flex flex-col items-center justify-center gap-3 px-6 py-16 text-center",
      className
    )}
  >
    <div
      className={cn(
        "flex h-10 w-10 items-center justify-center rounded-full border border-neutral-800 bg-neutral-950",
        toneRing[tone]
      )}
    >
      {icon || (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="12" cy="12" r="9" />
          <path d="M8 12h8" />
        </svg>
      )}
    </div>
    <div className="max-w-sm space-y-1">
      <div className="text-[13px] font-semibold text-neutral-200">{title}</div>
      {description ? (
        <div className="text-[12.5px] leading-relaxed text-neutral-500">{description}</div>
      ) : null}
    </div>
    {action ? <div className="mt-2">{action}</div> : null}
  </div>
);
