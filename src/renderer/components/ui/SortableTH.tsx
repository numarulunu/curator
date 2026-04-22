import React from "react";
import { cn } from "../../lib/cn";
import { TH } from "./Table";

export interface SortableTHProps<K extends string> {
  sortKey: K;
  currentKey: K;
  direction: "asc" | "desc";
  onSort: (key: K) => void;
  children: React.ReactNode;
  className?: string;
  align?: "left" | "right";
}

export function SortableTH<K extends string>({
  sortKey,
  currentKey,
  direction,
  onSort,
  children,
  className,
  align = "left",
}: SortableTHProps<K>) {
  const active = currentKey === sortKey;
  return (
    <TH className={cn(align === "right" && "text-right", className)}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          "inline-flex items-center gap-1 transition-colors",
          align === "right" && "flex-row-reverse",
          active ? "text-neutral-200" : "text-neutral-500 hover:text-neutral-300"
        )}
      >
        <span>{children}</span>
        <span
          aria-hidden
          className={cn(
            "inline-block font-mono text-[10px] leading-none",
            active ? "text-neutral-300" : "text-neutral-700"
          )}
        >
          {active ? (direction === "asc" ? "▲" : "▼") : "↕"}
        </span>
      </button>
    </TH>
  );
}
