import { type SidePanelId, useCanvasContext } from "@contexts/CanvasContext";
import { IconButton } from "@ui/IconButton";
import { X } from "lucide-react";
import type { ReactNode } from "react";

const PANEL_TITLES: Record<SidePanelId, string> = {
  config: "Node Config",
  state: "State Fields",
  history: "Run History",
  schema: "Schema",
};

interface SidePanelProps {
  width: number;
  children: ReactNode;
}

export function SidePanel({ width, children }: SidePanelProps) {
  const { activeSidePanel, closeSidePanel } = useCanvasContext();

  if (!activeSidePanel) return null;

  return (
    <div
      className="flex flex-col border-l border-zinc-800 bg-zinc-900"
      style={{ width, minWidth: width }}
      role="complementary"
      aria-label={PANEL_TITLES[activeSidePanel]}
    >
      <div className="flex h-[49px] shrink-0 items-center justify-between border-b border-zinc-800 px-4">
        <h2 className="text-sm font-semibold text-zinc-100">
          {PANEL_TITLES[activeSidePanel]}
        </h2>
        <IconButton onClick={closeSidePanel} aria-label="Close panel">
          <X size={14} />
        </IconButton>
      </div>
      <div className="flex-1 overflow-y-auto p-4">{children}</div>
    </div>
  );
}
