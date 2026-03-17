import { X } from "lucide-react";
import type { ReactNode } from "react";
import { IconButton } from "./IconButton";

type SheetSide = "left" | "right" | "bottom";

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  side?: SheetSide;
  children: ReactNode;
}

const sideClasses: Record<
  SheetSide,
  {
    position: string;
    border: string;
    openTransform: string;
    closedTransform: string;
    size: string;
  }
> = {
  left: {
    position: "left-0 top-0",
    border: "border-r",
    openTransform: "translate-x-0",
    closedTransform: "-translate-x-full",
    size: "h-full w-80",
  },
  right: {
    position: "right-0 top-0",
    border: "border-l",
    openTransform: "translate-x-0",
    closedTransform: "translate-x-full",
    size: "h-full w-80",
  },
  bottom: {
    position: "inset-x-0 bottom-0",
    border: "border-t",
    openTransform: "translate-y-0",
    closedTransform: "translate-y-full",
    size: "w-full h-64",
  },
};

export function Sheet({
  open,
  onClose,
  title,
  side = "right",
  children,
}: SheetProps) {
  const { position, border, openTransform, closedTransform, size } =
    sideClasses[side];

  return (
    <div
      className={`absolute ${position} z-20 ${size} ${border} border-zinc-800 bg-zinc-900 shadow-xl transition-transform duration-200 ease-in-out ${open ? openTransform : closedTransform}`}
      // biome-ignore lint/a11y/useSemanticElements: Sheet uses div+role instead of <dialog> to avoid modal backdrop and enable CSS slide transitions
      role="dialog"
      aria-label={title}
      aria-hidden={!open}
    >
      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
        <h2 className="text-sm font-semibold text-zinc-100">{title}</h2>
        <IconButton onClick={onClose} aria-label="Close panel">
          <X size={14} />
        </IconButton>
      </div>
      <div
        className="overflow-y-auto p-4"
        style={{ height: "calc(100% - 49px)" }}
      >
        {children}
      </div>
    </div>
  );
}
