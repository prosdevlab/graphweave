import { memo } from "react";

interface CanvasHintProps {
  nodeCount: number;
}

function CanvasHintComponent({ nodeCount }: CanvasHintProps) {
  if (nodeCount > 2) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-16 flex justify-center">
      <div className="rounded-lg bg-zinc-800/80 px-4 py-2 text-xs text-zinc-400 backdrop-blur-sm">
        Click a node in the toolbar, then click to place — or drag it onto the
        canvas
      </div>
    </div>
  );
}

export const CanvasHint = memo(CanvasHintComponent);
