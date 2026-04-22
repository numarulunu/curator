import React from "react";
import { cn } from "../../lib/cn";

export type StatTone = "default" | "muted" | "info" | "success" | "warn" | "danger";

const valueTone: Record<StatTone, string> = {
  default: "text-neutral-100",
  muted: "text-neutral-600",
  info: "text-sky-300",
  success: "text-emerald-300",
  warn: "text-amber-300",
  danger: "text-rose-300",
};

export interface StatProps {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: StatTone;
  className?: string;
}

export const Stat: React.FC<StatProps> = ({ label, value, hint, tone = "default", className }) => (
  <div className={cn("flex flex-col gap-1.5", className)}>
    <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-neutral-500">{label}</div>
    <div className={cn("font-mono text-2xl leading-none tabular-nums tracking-tight", valueTone[tone])}>{value}</div>
    {hint ? <div className="text-[11.5px] text-neutral-500">{hint}</div> : null}
  </div>
);
