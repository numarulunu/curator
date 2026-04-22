import React from "react";
import { cn } from "../../lib/cn";

type Variant = "primary" | "outline" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const variants: Record<Variant, string> = {
  primary:
    "bg-neutral-200 text-neutral-900 hover:bg-white border border-neutral-200 disabled:bg-neutral-800 disabled:text-neutral-500 disabled:border-neutral-800",
  outline:
    "bg-transparent text-neutral-200 border border-neutral-700 hover:border-neutral-500 hover:text-white disabled:text-neutral-600 disabled:border-neutral-800",
  ghost:
    "bg-transparent text-neutral-400 border border-transparent hover:text-neutral-100 hover:bg-neutral-900 disabled:text-neutral-700",
  danger:
    "bg-rose-700 text-white border border-rose-700 hover:bg-rose-600 hover:border-rose-600 disabled:bg-neutral-800 disabled:border-neutral-800 disabled:text-neutral-500",
};

const sizes: Record<Size, string> = {
  sm: "h-7 px-2.5 text-[12px]",
  md: "h-8 px-3 text-[12.5px]",
  lg: "h-9 px-4 text-[13px]",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "outline", size = "md", loading, disabled, className, children, ...rest }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          "inline-flex items-center justify-center gap-1.5 rounded font-medium tracking-tight transition-colors",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-500",
          "disabled:cursor-not-allowed",
          variants[variant],
          sizes[size],
          className
        )}
        {...rest}
      >
        {loading ? (
          <span
            className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-current border-t-transparent"
            aria-hidden
          />
        ) : null}
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";
