import type { NodeSchema } from "@shared/schema";
import { useGraphStore } from "@store/graphSlice";
import { useUIStore } from "@store/uiSlice";
import { useCallback } from "react";
import {
  NODE_DEFAULTS,
  SINGLETON_TYPES,
  findNearestEdge,
} from "../utils/nodeDefaults";

/**
 * Hook that provides a function to place a node at a given flow-coordinate position.
 * Handles singleton constraints and drop-on-edge insertion.
 *
 * @returns `placeNode(nodeType, position)` — returns `true` if placed, `false` if blocked.
 */
export function useNodePlacement() {
  const addNode = useGraphStore((s) => s.addNode);
  const addEdge = useGraphStore((s) => s.addEdge);
  const removeEdge = useGraphStore((s) => s.removeEdge);
  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);

  const placeNode = useCallback(
    (nodeType: string, position: { x: number; y: number }): boolean => {
      if (!NODE_DEFAULTS[nodeType]) return false;

      // Prevent duplicate singletons
      if (
        SINGLETON_TYPES.has(nodeType) &&
        nodes.some((n) => n.type === nodeType)
      ) {
        const label = NODE_DEFAULTS[nodeType]()?.label ?? nodeType;
        useUIStore
          .getState()
          .showToast(`A ${label} node already exists`, "info");
        return false;
      }

      const defaults = NODE_DEFAULTS[nodeType]();
      const newNode: NodeSchema = {
        id: crypto.randomUUID(),
        position,
        ...defaults,
      } as NodeSchema;

      // Check if placed near an existing edge (drop-on-edge to insert)
      const nearestEdge = findNearestEdge(position, nodes, edges);

      addNode(newNode);

      if (nearestEdge) {
        removeEdge(nearestEdge.id);
        addEdge({
          id: `e-${nearestEdge.source}-${newNode.id}`,
          source: nearestEdge.source,
          target: newNode.id,
        });
        addEdge({
          id: `e-${newNode.id}-${nearestEdge.target}`,
          source: newNode.id,
          target: nearestEdge.target,
        });
      }

      return true;
    },
    [addNode, addEdge, removeEdge, nodes, edges],
  );

  return { placeNode };
}
