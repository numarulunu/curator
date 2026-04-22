import React from "react";
import { cn } from "../../lib/cn";

export const Skeleton: React.FC<{ className?: string }> = ({ className }) => (
  <div
    className={cn(
      "animate-pulse rounded bg-gradient-to-r from-neutral-900 via-neutral-800/60 to-neutral-900",
      className
    )}
  />
);

export const SkeletonRow: React.FC<{ cols?: number }> = ({ cols = 4 }) => (
  <div className="flex items-center gap-4 border-b border-neutral-900 px-4 py-3">
    {Array.from({ length: cols }).map((_, i) => (
      <Skeleton key={i} className={cn("h-3", i === 0 ? "w-[45%]" : "w-[15%]")} />
    ))}
  </div>
);
