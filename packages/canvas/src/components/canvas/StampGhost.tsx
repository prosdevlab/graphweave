import { useCanvasContext } from "@contexts/CanvasContext";
import { memo, useEffect, useRef, useState } from "react";
import { TOOLBAR_ITEMS } from "../../constants/toolbarItems";

function StampGhostComponent() {
  const { stampNodeType } = useCanvasContext();
  const containerRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!stampNodeType) {
      setPos(null);
      return;
    }

    function handleMouseMove(event: MouseEvent) {
      const container = containerRef.current?.parentElement;
      if (!container) return;

      // Hide ghost when hovering over the floating toolbar
      const toolbar = container.querySelector(
        '[data-testid="floating-toolbar"]',
      );
      if (toolbar?.contains(event.target as Node)) {
        setPos(null);
        return;
      }

      const rect = container.getBoundingClientRect();
      setPos({
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      });
    }

    function handleMouseLeave() {
      setPos(null);
    }

    // Listen on document to capture moves everywhere including over toolbar
    document.addEventListener("mousemove", handleMouseMove);
    const container = containerRef.current?.parentElement;
    container?.addEventListener("mouseleave", handleMouseLeave);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      container?.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, [stampNodeType]);

  if (!stampNodeType) return <div ref={containerRef} className="hidden" />;

  const item = TOOLBAR_ITEMS.find((t) => t.type === stampNodeType);
  if (!item) return <div ref={containerRef} className="hidden" />;

  return (
    <div
      ref={containerRef}
      className="pointer-events-none absolute inset-0 z-20"
    >
      {pos && (
        <div
          className={`absolute flex items-center gap-2 rounded-lg border ${item.accentBorder} bg-zinc-900/70 px-3 py-1.5 opacity-50`}
          style={{
            left: pos.x,
            top: pos.y,
            transform: "translate(-50%, -50%)",
          }}
          data-testid="stamp-ghost"
        >
          <item.icon size={14} className={item.iconColor} />
          <span className="text-xs text-zinc-300">{item.label}</span>
        </div>
      )}
    </div>
  );
}

export const StampGhost = memo(StampGhostComponent);
