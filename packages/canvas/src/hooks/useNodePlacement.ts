import type { NodeSchema } from "@shared/schema";
import { useGraphStore } from "@store/graphSlice";
import { useUIStore } from "@store/uiSlice";
import { useCallback } from "react";
import {
  NODE_DEFAULTS,
  SINGLETON_TYPES,
  deduplicateOutputKey,
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
  const spliceEdge = useGraphStore((s) => s.spliceEdge);

  const placeNode = useCallback(
    (nodeType: string, position: { x: number; y: number }): boolean => {
      if (!NODE_DEFAULTS[nodeType]) return false;

      // Read fresh state to avoid stale closures
      const { nodes, edges } = useGraphStore.getState();

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

      // Dedup output_key for tool/llm nodes to prevent silent collisions
      if (
        (nodeType === "tool" || nodeType === "llm") &&
        defaults.config &&
        "output_key" in defaults.config
      ) {
        const existingKeys = new Set(
          nodes
            .filter((n) => n.type === "tool" || n.type === "llm")
            .map((n) => (n.config as { output_key: string }).output_key),
        );
        defaults.config.output_key = deduplicateOutputKey(
          defaults.config.output_key as string,
          existingKeys,
        );
      }

      const newNode: NodeSchema = {
        id: crypto.randomUUID(),
        position,
        ...defaults,
      } as NodeSchema;

      // Check if placed near an existing edge (drop-on-edge to insert)
      const nearestEdge = findNearestEdge(position, nodes, edges);

      if (nearestEdge) {
        spliceEdge(
          nearestEdge.id,
          newNode,
          {
            id: crypto.randomUUID(),
            source: nearestEdge.source,
            target: newNode.id,
            // Preserve condition_branch on first segment (source → inserted node)
            ...(nearestEdge.condition_branch
              ? { condition_branch: nearestEdge.condition_branch }
              : {}),
          },
          {
            id: crypto.randomUUID(),
            source: newNode.id,
            target: nearestEdge.target,
            // No condition_branch on second segment — inserted node is not condition
          },
        );
      } else {
        addNode(newNode);
      }

      return true;
    },
    [addNode, spliceEdge],
  );

  return { placeNode };
}
