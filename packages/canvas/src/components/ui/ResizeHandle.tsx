import { useCallback, useEffect, useRef } from "react";

interface ResizeHandleProps {
  direction: "horizontal" | "vertical";
  onResize: (delta: number) => void;
  onResizeEnd?: () => void;
}

export function ResizeHandle({
  direction,
  onResize,
  onResizeEnd,
}: ResizeHandleProps) {
  const dragging = useRef(false);
  const lastPos = useRef(0);
  const onResizeRef = useRef(onResize);
  const onResizeEndRef = useRef(onResizeEnd);
  onResizeRef.current = onResize;
  onResizeEndRef.current = onResizeEnd;

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragging.current = true;
      lastPos.current = direction === "horizontal" ? e.clientY : e.clientX;
      document.body.style.cursor =
        direction === "horizontal" ? "row-resize" : "col-resize";
      document.body.style.userSelect = "none";
    },
    [direction],
  );

  useEffect(() => {
    function handleMouseMove(e: MouseEvent) {
      if (!dragging.current) return;
      const pos = direction === "horizontal" ? e.clientY : e.clientX;
      const delta = pos - lastPos.current;
      lastPos.current = pos;
      onResizeRef.current(delta);
    }

    function handleMouseUp() {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      onResizeEndRef.current?.();
    }

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [direction]);

  const isHorizontal = direction === "horizontal";

  return (
    <div
      onMouseDown={handleMouseDown}
      className={`${
        isHorizontal
          ? "h-1 w-full cursor-row-resize"
          : "h-full w-1 cursor-col-resize"
      } group flex shrink-0 items-center justify-center bg-zinc-900 transition-colors hover:bg-indigo-500/30`}
      aria-label={isHorizontal ? "Resize height" : "Resize width"}
    >
      <div
        className={`${
          isHorizontal ? "h-0.5 w-8" : "h-8 w-0.5"
        } rounded-full bg-zinc-700 transition-colors group-hover:bg-indigo-400`}
      />
    </div>
  );
}
