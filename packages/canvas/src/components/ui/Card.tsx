import { type HTMLAttributes, forwardRef } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  interactive?: boolean;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ interactive = false, className = "", children, ...props }, ref) => (
    <div
      ref={ref}
      className={`rounded-lg border border-zinc-800 bg-zinc-900 ${interactive ? "cursor-pointer transition-colors hover:border-zinc-600 hover:bg-zinc-800/80" : ""} ${className}`}
      {...props}
    >
      {children}
    </div>
  ),
);
Card.displayName = "Card";

export function CardHeader({
  className = "",
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`px-4 pt-4 ${className}`} {...props}>
      {children}
    </div>
  );
}

export function CardContent({
  className = "",
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`px-4 py-3 ${className}`} {...props}>
      {children}
    </div>
  );
}

export function CardFooter({
  className = "",
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`px-4 pb-4 text-xs text-zinc-500 ${className}`} {...props}>
      {children}
    </div>
  );
}
