import { memo } from "react";

interface CanvasHintProps {
  nodeCount: number;
}

function CanvasHintComponent({ nodeCount }: CanvasHintProps) {
  if (nodeCount > 2) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-16 flex justify-center">
      <div className="rounded-lg bg-zinc-800/80 px-4 py-2 text-xs text-zinc-400 backdrop-blur-sm">
        Drag nodes from the toolbar to build your graph
      </div>
    </div>
  );
}

export const CanvasHint = memo(CanvasHintComponent);
