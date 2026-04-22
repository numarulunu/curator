import React from "react";
import { cn } from "../../lib/cn";

export const Card: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, ...rest }) => (
  <div
    className={cn("rounded-md border border-neutral-800 bg-neutral-900/40 shadow-[0_1px_0_0_rgba(0,0,0,0.4)]", className)}
    {...rest}
  />
);

export const CardHeader: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, ...rest }) => (
  <div
    className={cn(
      "flex items-center justify-between gap-3 border-b border-neutral-800 px-4 py-3",
      className
    )}
    {...rest}
  />
);

export const CardTitle: React.FC<React.HTMLAttributes<HTMLHeadingElement>> = ({ className, children, ...rest }) => (
  <h3
    className={cn("text-[12px] font-semibold uppercase tracking-[0.14em] text-neutral-300", className)}
    {...rest}
  >
    {children}
  </h3>
);

export const CardBody: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, ...rest }) => (
  <div className={cn("p-4", className)} {...rest} />
);

export const CardFooter: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, ...rest }) => (
  <div className={cn("border-t border-neutral-800 px-4 py-3", className)} {...rest} />
);
