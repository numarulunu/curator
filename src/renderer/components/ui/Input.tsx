import React from "react";
import { cn } from "../../lib/cn";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, ...rest }, ref) => (
  <input
    ref={ref}
    className={cn(
      "h-8 rounded border border-neutral-800 bg-neutral-950 px-2.5 text-[12.5px] text-neutral-200 placeholder:text-neutral-600",
      "focus:border-neutral-600 focus:outline-none",
      "disabled:cursor-not-allowed disabled:opacity-50",
      className
    )}
    {...rest}
  />
));
Input.displayName = "Input";
