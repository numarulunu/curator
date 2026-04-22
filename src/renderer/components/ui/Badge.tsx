import React from "react";
import { cn } from "../../lib/cn";

export type BadgeTone = "default" | "info" | "success" | "warn" | "danger" | "muted";

const tones: Record<BadgeTone, string> = {
  default: "bg-neutral-800 text-neutral-200 border border-neutral-700",
  info: "bg-sky-950/60 text-sky-300 border border-sky-900/80",
  success: "bg-emerald-950/60 text-emerald-300 border border-emerald-900/80",
  warn: "bg-amber-950/60 text-amber-300 border border-amber-900/80",
  danger: "bg-rose-950/60 text-rose-300 border border-rose-900/80",
  muted: "bg-neutral-900 text-neutral-500 border border-neutral-800",
};

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  uppercase?: boolean;
}

export const Badge: React.FC<BadgeProps> = ({ tone = "default", uppercase, className, children, ...rest }) => (
  <span
    className={cn(
      "inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[10.5px] leading-none tracking-[0.08em]",
      uppercase && "uppercase",
      tones[tone],
      className
    )}
    {...rest}
  >
    {children}
  </span>
);
