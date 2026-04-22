import React from "react";
import { cn } from "../../lib/cn";

export interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  eyebrow,
  title,
  description,
  actions,
  className,
}) => (
  <div className={cn("mb-6 flex flex-col gap-4 border-b border-neutral-900 pb-5 md:flex-row md:items-end md:justify-between", className)}>
    <div className="min-w-0 space-y-1.5">
      {eyebrow ? (
        <div className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
          {eyebrow}
        </div>
      ) : null}
      <h1 className="text-[22px] font-semibold tracking-tight text-neutral-100">{title}</h1>
      {description ? (
        <p className="max-w-2xl text-[12.5px] leading-relaxed text-neutral-500">{description}</p>
      ) : null}
    </div>
    {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
  </div>
);
