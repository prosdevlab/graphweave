import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import type { ReactNode } from "react";

type TooltipSide = "top" | "right" | "bottom" | "left";

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  side?: TooltipSide;
}

export function Tooltip({ content, children, side = "right" }: TooltipProps) {
  const isSimple = typeof content === "string";
  return (
    <TooltipPrimitive.Provider delayDuration={200}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side={side}
            sideOffset={6}
            className={`z-50 ${isSimple ? "whitespace-nowrap" : "max-w-xs whitespace-normal"} rounded-md bg-zinc-800 px-2 py-1 text-xs text-zinc-200 shadow-md animate-in fade-in-0 zoom-in-95`}
          >
            {content}
            <TooltipPrimitive.Arrow className="fill-zinc-800" />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
