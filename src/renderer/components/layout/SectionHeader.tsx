import React from "react";
import { cn } from "../../lib/cn";

export const SectionHeader: React.FC<{
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}> = ({ title, description, actions, className }) => (
  <div className={cn("mb-3 flex items-end justify-between gap-4", className)}>
    <div>
      <h2 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-neutral-400">{title}</h2>
      {description ? <p className="mt-1 text-[12.5px] text-neutral-500">{description}</p> : null}
    </div>
    {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
  </div>
);
