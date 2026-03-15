import { X } from "lucide-react";
import type { ReactNode } from "react";

type SheetSide = "left" | "right";

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  side?: SheetSide;
  children: ReactNode;
}

const sideClasses: Record<
  SheetSide,
  { position: string; border: string; transform: string }
> = {
  left: {
    position: "left-0",
    border: "border-r",
    transform: "-translate-x-full",
  },
  right: {
    position: "right-0",
    border: "border-l",
    transform: "translate-x-full",
  },
};

export function Sheet({
  open,
  onClose,
  title,
  side = "right",
  children,
}: SheetProps) {
  const { position, border, transform } = sideClasses[side];

  return (
    <div
      className={`absolute ${position} top-0 z-20 h-full w-80 ${border} border-zinc-800 bg-zinc-900 shadow-xl transition-transform duration-200 ease-in-out ${open ? "translate-x-0" : transform}`}
      // biome-ignore lint/a11y/useSemanticElements: Sheet uses div+role instead of <dialog> to avoid modal backdrop and enable CSS slide transitions
      role="dialog"
      aria-label={title}
      aria-hidden={!open}
    >
      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
        <h2 className="text-sm font-semibold text-zinc-100">{title}</h2>
        <button
          onClick={onClose}
          className="rounded-sm p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
          aria-label="Close panel"
          type="button"
        >
          <X size={14} />
        </button>
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
