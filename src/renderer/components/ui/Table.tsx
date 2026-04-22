import React from "react";
import { cn } from "../../lib/cn";

export const Table: React.FC<React.TableHTMLAttributes<HTMLTableElement>> = ({ className, ...rest }) => (
  <table className={cn("w-full border-collapse text-left text-[12.5px]", className)} {...rest} />
);

export const THead: React.FC<React.HTMLAttributes<HTMLTableSectionElement>> = ({ className, ...rest }) => (
  <thead
    className={cn(
      "sticky top-0 z-10 bg-neutral-950/95 backdrop-blur [&_th]:border-b [&_th]:border-neutral-800",
      className
    )}
    {...rest}
  />
);

export const TR: React.FC<React.HTMLAttributes<HTMLTableRowElement>> = ({ className, ...rest }) => (
  <tr
    className={cn("border-b border-neutral-900 transition-colors hover:bg-neutral-900/40", className)}
    {...rest}
  />
);

export const TH: React.FC<React.ThHTMLAttributes<HTMLTableHeaderCellElement>> = ({ className, ...rest }) => (
  <th
    className={cn(
      "px-3 py-2 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-neutral-500",
      className
    )}
    {...rest}
  />
);

export const TD: React.FC<React.TdHTMLAttributes<HTMLTableDataCellElement>> = ({ className, ...rest }) => (
  <td className={cn("px-3 py-2 align-top text-neutral-300", className)} {...rest} />
);
