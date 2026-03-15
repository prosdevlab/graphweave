import { type ButtonHTMLAttributes, forwardRef } from "react";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: "sm" | "md";
}

const sizeClasses = {
  sm: "h-7 w-7",
  md: "h-8 w-8",
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ size = "sm", className = "", ...props }, ref) => (
    <button
      ref={ref}
      className={`inline-flex cursor-pointer items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300 disabled:pointer-events-none disabled:opacity-50 ${sizeClasses[size]} ${className}`}
      type="button"
      {...props}
    />
  ),
);
IconButton.displayName = "IconButton";
