import { useCanvasContext } from "@contexts/CanvasContext";
import { Tooltip } from "@ui/Tooltip";
import { CircuitBoard, MousePointer2, X } from "lucide-react";
import { type DragEvent, memo, useCallback, useEffect, useState } from "react";
import { TOOLBAR_ITEMS } from "../../constants/toolbarItems";

function FloatingToolbarComponent() {
  const { stampNodeType, setStampNodeType } = useCanvasContext();
  const [expanded, setExpanded] = useState(stampNodeType !== null);

  const handlePointerClick = useCallback(() => {
    setStampNodeType(null);
    setExpanded(false);
  }, [setStampNodeType]);

  const handleExpandClick = useCallback(() => {
    setExpanded(true);
  }, []);

  const handleCloseClick = useCallback(() => {
    setStampNodeType(null);
    setExpanded(false);
  }, [setStampNodeType]);

  const handleNodeTypeClick = useCallback(
    (type: string) => {
      setStampNodeType(stampNodeType === type ? null : type);
    },
    [stampNodeType, setStampNodeType],
  );

  const handleDragStart = useCallback((event: DragEvent, nodeType: string) => {
    event.dataTransfer.setData("application/graphweave-node-type", nodeType);
    event.dataTransfer.effectAllowed = "move";
  }, []);

  // Auto-expand when stamp is set
  useEffect(() => {
    if (stampNodeType) setExpanded(true);
  }, [stampNodeType]);

  // Escape key handling
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      const target = event.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      if (stampNodeType) {
        setStampNodeType(null);
      } else if (expanded) {
        setExpanded(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [stampNodeType, expanded, setStampNodeType]);

  const isPointerActive = !stampNodeType;

  return (
    <div
      className="absolute top-1/2 left-4 z-10 flex -translate-y-1/2 cursor-default flex-col rounded-xl border border-zinc-800 bg-zinc-900/90 backdrop-blur-sm"
      data-testid="floating-toolbar"
    >
      {expanded ? (
        /* Expanded: X header at top */
        <>
          <Tooltip content="Close" side="right">
            <button
              type="button"
              onClick={handleCloseClick}
              className="flex h-10 w-full items-center justify-center rounded-t-xl bg-zinc-800/80 text-zinc-400 hover:bg-zinc-700/80 hover:text-zinc-200"
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </Tooltip>

          <div className="flex flex-col gap-1 p-1.5">
            {/* Pointer button */}
            <Tooltip content="Pointer" side="right">
              <button
                type="button"
                onClick={handlePointerClick}
                className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
                  isPointerActive
                    ? "bg-zinc-700/50 text-zinc-100"
                    : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                }`}
                aria-label="Pointer"
              >
                <MousePointer2 size={16} />
              </button>
            </Tooltip>

            {/* Node type buttons */}
            {TOOLBAR_ITEMS.map((item) => {
              const isActive = stampNodeType === item.type;
              return (
                <Tooltip key={item.type} content={item.label} side="right">
                  <button
                    type="button"
                    draggable
                    onClick={() => handleNodeTypeClick(item.type)}
                    onDragStart={(e) => handleDragStart(e, item.type)}
                    className={`flex h-9 w-9 cursor-grab items-center justify-center rounded-lg transition-colors active:cursor-grabbing ${
                      isActive
                        ? `${item.accentBg} ${item.iconColor}`
                        : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                    }`}
                    aria-label={item.label}
                    aria-pressed={isActive}
                  >
                    <item.icon size={16} />
                  </button>
                </Tooltip>
              );
            })}
          </div>
        </>
      ) : (
        /* Collapsed: Pointer + CircuitBoard */
        <div className="flex flex-col gap-1 p-1.5">
          <Tooltip content="Pointer" side="right">
            <button
              type="button"
              onClick={handlePointerClick}
              className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
                isPointerActive
                  ? "bg-zinc-700/50 text-zinc-100"
                  : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
              }`}
              aria-label="Pointer"
            >
              <MousePointer2 size={16} />
            </button>
          </Tooltip>

          <Tooltip content="Nodes" side="right">
            <button
              type="button"
              onClick={handleExpandClick}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
              aria-label="Nodes"
            >
              <CircuitBoard size={16} />
            </button>
          </Tooltip>
        </div>
      )}
    </div>
  );
}

export const FloatingToolbar = memo(FloatingToolbarComponent);
