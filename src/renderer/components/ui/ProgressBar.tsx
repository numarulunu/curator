import React from "react";
import { cn } from "../../lib/cn";

export const ProgressBar: React.FC<{
  value?: number;
  max?: number;
  indeterminate?: boolean;
  className?: string;
  tone?: "default" | "success" | "warn" | "danger";
}> = ({ value, max = 100, indeterminate, className, tone = "default" }) => {
  const pct = typeof value === "number" ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  const barTone =
    tone === "success"
      ? "bg-emerald-400"
      : tone === "warn"
      ? "bg-amber-400"
      : tone === "danger"
      ? "bg-red-400"
      : "bg-neutral-100";
  return (
    <div className={cn("relative h-1 w-full overflow-hidden rounded bg-neutral-900", className)}>
      {indeterminate ? (
        <div className={cn("absolute inset-y-0 -left-1/3 w-1/3 animate-[progressIndet_1.2s_ease-in-out_infinite]", barTone)} />
      ) : (
        <div className={cn("h-full transition-[width] duration-300", barTone)} style={{ width: `${pct}%` }} />
      )}
    </div>
  );
};
