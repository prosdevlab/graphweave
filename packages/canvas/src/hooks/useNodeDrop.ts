import type { ReactFlowInstance } from "@xyflow/react";
import { type DragEvent, useCallback } from "react";
import { NODE_DEFAULTS } from "../utils/nodeDefaults";
import { useNodePlacement } from "./useNodePlacement";

export function useNodeDrop(reactFlowInstance: ReactFlowInstance | null) {
  const { placeNode } = useNodePlacement();

  const onDragOver = useCallback((event: DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault();
      if (!reactFlowInstance) return;

      const nodeType = event.dataTransfer.getData(
        "application/graphweave-node-type",
      );
      if (!nodeType || !NODE_DEFAULTS[nodeType]) return;

      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      placeNode(nodeType, position);
    },
    [reactFlowInstance, placeNode],
  );

  return { onDragOver, onDrop };
}
