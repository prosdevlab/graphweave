import type { ReactNode } from "react";

type TooltipSide = "top" | "right" | "bottom" | "left";

interface TooltipProps {
  content: string;
  children: ReactNode;
  side?: TooltipSide;
}

const sideClasses: Record<TooltipSide, string> = {
  top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
  right: "left-full top-1/2 -translate-y-1/2 ml-2",
  bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
  left: "right-full top-1/2 -translate-y-1/2 mr-2",
};

export function Tooltip({ content, children, side = "right" }: TooltipProps) {
  return (
    <div className="group relative inline-flex">
      {children}
      <div
        role="tooltip"
        className={`pointer-events-none absolute ${sideClasses[side]} z-50 whitespace-nowrap rounded-md bg-zinc-800 px-2 py-1 text-xs text-zinc-200 opacity-0 shadow-md transition-opacity group-hover:opacity-100`}
      >
        {content}
      </div>
    </div>
  );
}
