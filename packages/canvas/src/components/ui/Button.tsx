import { type ButtonHTMLAttributes, forwardRef } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "chip";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "rounded-md px-3 py-1.5 text-sm bg-indigo-600 text-white hover:bg-indigo-700 active:bg-indigo-800",
  secondary:
    "rounded-md px-3 py-1.5 text-sm bg-zinc-800 text-zinc-100 hover:bg-zinc-700 active:bg-zinc-600 border border-zinc-700",
  ghost:
    "rounded-md px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800",
  danger:
    "rounded-md px-3 py-1.5 text-sm bg-red-600 text-white hover:bg-red-500 active:bg-red-700",
  chip: "rounded-full px-2 py-0.5 text-[10px] border border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "secondary", className = "", ...props }, ref) => (
    <button
      ref={ref}
      className={`inline-flex cursor-pointer items-center justify-center font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 ${variantClasses[variant]} ${className}`}
      {...props}
    />
  ),
);
Button.displayName = "Button";
