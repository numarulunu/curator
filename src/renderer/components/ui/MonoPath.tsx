import React, { useState } from "react";
import { cn } from "../../lib/cn";

export interface MonoPathProps {
  path: string;
  className?: string;
  truncate?: boolean;
}

export const MonoPath: React.FC<MonoPathProps> = ({ path, className, truncate }) => {
  const [copied, setCopied] = useState(false);
  const copy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(path);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {/* ignore */
    }
  };

  return (
    <div className={cn("group flex items-start gap-2", className)}>
      <span
        title={path}
        className={cn(
          "min-w-0 flex-1 font-mono text-[12px] leading-relaxed text-neutral-400",
          truncate ? "truncate" : "break-all"
        )}
      >
        {path}
      </span>
      <button
        type="button"
        onClick={copy}
        className={cn(
          "shrink-0 rounded border border-neutral-800 bg-neutral-950 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em]",
          "text-neutral-600 opacity-0 transition-opacity hover:text-neutral-200 group-hover:opacity-100",
          copied && "opacity-100 text-emerald-400 border-emerald-900/60"
        )}
        aria-label="Copy path"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
};
