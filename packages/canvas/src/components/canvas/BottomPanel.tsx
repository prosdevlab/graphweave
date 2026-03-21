import { type BottomTab, useCanvasContext } from "@contexts/CanvasContext";
import { useRunStore } from "@store/runSlice";
import { IconButton } from "@ui/IconButton";
import { Minus, X } from "lucide-react";
import type { ReactNode } from "react";
import { formatDuration } from "../../utils/format";

const TABS: { id: BottomTab; label: string }[] = [
  { id: "timeline", label: "Timeline" },
  { id: "debug", label: "Debug" },
];

const TAB_BAR_HEIGHT = 33;

interface BottomPanelProps {
  height: number;
  children: ReactNode;
}

export function BottomPanel({ height, children }: BottomPanelProps) {
  const {
    bottomPanelMinimized,
    activeBottomTab,
    setActiveBottomTab,
    setBottomPanelMinimized,
    setBottomPanelVisible,
  } = useCanvasContext();

  const runStatus = useRunStore((s) => s.runStatus);
  const durationMs = useRunStore((s) => s.durationMs);
  const activeRunId = useRunStore((s) => s.activeRunId);

  const statusLabel =
    runStatus === "running"
      ? "Running..."
      : runStatus === "completed"
        ? `Completed ${formatDuration(durationMs)}`
        : runStatus === "error"
          ? "Failed"
          : runStatus === "paused"
            ? "Paused"
            : runStatus === "reconnecting"
              ? "Reconnecting..."
              : runStatus === "connection_lost"
                ? "Connection lost"
                : null;

  return (
    <div
      className="flex shrink-0 flex-col border-t border-zinc-800 bg-zinc-900"
      style={{ height: bottomPanelMinimized ? TAB_BAR_HEIGHT : height }}
    >
      {/* Tab bar */}
      <div className="flex h-[33px] shrink-0 items-center justify-between border-b border-zinc-800 px-2">
        <div className="flex items-center">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setActiveBottomTab(tab.id);
                if (bottomPanelMinimized) setBottomPanelMinimized(false);
              }}
              className={`cursor-pointer px-3 py-1.5 text-xs transition-colors ${
                activeBottomTab === tab.id
                  ? "border-b-2 border-indigo-500 text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {statusLabel && (
            <span className="text-[11px] text-zinc-500">
              {activeRunId && (
                <span className="mr-1.5 font-mono">
                  #{activeRunId.slice(0, 6)}
                </span>
              )}
              {statusLabel}
            </span>
          )}
          <div className="flex items-center gap-0.5">
            <IconButton
              onClick={() => setBottomPanelMinimized(!bottomPanelMinimized)}
              aria-label={
                bottomPanelMinimized ? "Expand panel" : "Minimize panel"
              }
            >
              <Minus size={12} />
            </IconButton>
            <IconButton
              onClick={() => setBottomPanelVisible(false)}
              aria-label="Close panel"
            >
              <X size={12} />
            </IconButton>
          </div>
        </div>
      </div>

      {/* Content */}
      {!bottomPanelMinimized && (
        <div className="flex-1 overflow-y-auto">{children}</div>
      )}
    </div>
  );
}
