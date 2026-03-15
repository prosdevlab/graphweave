import type { EdgeSchema, NodeSchema } from "@shared/schema";
import { useGraphStore } from "@store/graphSlice";
import type { ReactFlowInstance } from "@xyflow/react";
import { type DragEvent, useCallback } from "react";

/** Default configs for each C1 node type */
const NODE_DEFAULTS: Record<string, () => Partial<NodeSchema>> = {
  start: () => ({
    type: "start" as const,
    label: "Start",
    config: {},
  }),
  llm: () => ({
    type: "llm" as const,
    label: "LLM",
    config: {
      provider: "openai",
      model: "gpt-4o",
      system_prompt: "",
      temperature: 0.7,
      max_tokens: 1024,
      input_map: {},
      output_key: "result",
    },
  }),
  end: () => ({
    type: "end" as const,
    label: "End",
    config: {},
  }),
};

/** Node types that can only appear once in a graph */
const SINGLETON_TYPES = new Set(["start", "end"]);

/** Distance threshold (in flow coordinates) for drop-on-edge detection */
const EDGE_DROP_THRESHOLD = 50;

/**
 * Calculate the minimum distance from a point to a line segment.
 * Used to detect if a dropped node is near an existing edge.
 */
function distanceToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);

  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const nearX = x1 + t * dx;
  const nearY = y1 + t * dy;
  return Math.hypot(px - nearX, py - nearY);
}

export function useNodeDrop(reactFlowInstance: ReactFlowInstance | null) {
  const addNode = useGraphStore((s) => s.addNode);
  const addEdge = useGraphStore((s) => s.addEdge);
  const removeEdge = useGraphStore((s) => s.removeEdge);
  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);

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

      // Prevent duplicate Start/End nodes
      if (
        SINGLETON_TYPES.has(nodeType) &&
        nodes.some((n) => n.type === nodeType)
      ) {
        return;
      }

      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const defaults = NODE_DEFAULTS[nodeType]();
      const newNode: NodeSchema = {
        id: crypto.randomUUID(),
        position,
        ...defaults,
      } as NodeSchema;

      // Check if dropped near an existing edge (drop-on-edge to insert)
      const nearestEdge = findNearestEdge(position, nodes, edges);

      addNode(newNode);

      if (nearestEdge) {
        // Split the edge: remove old, create source→new and new→target
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
    },
    [reactFlowInstance, addNode, addEdge, removeEdge, nodes, edges],
  );

  return { onDragOver, onDrop };
}

/**
 * Find the nearest edge to a drop position, if within threshold.
 * Uses node positions as edge endpoints (approximation for bezier curves).
 */
function findNearestEdge(
  dropPos: { x: number; y: number },
  nodes: NodeSchema[],
  edges: EdgeSchema[],
): EdgeSchema | null {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  let nearest: EdgeSchema | null = null;
  let minDist = EDGE_DROP_THRESHOLD;

  for (const edge of edges) {
    const sourceNode = nodeMap.get(edge.source);
    const targetNode = nodeMap.get(edge.target);
    if (!sourceNode || !targetNode) continue;

    const dist = distanceToSegment(
      dropPos.x,
      dropPos.y,
      sourceNode.position.x,
      sourceNode.position.y,
      targetNode.position.x,
      targetNode.position.y,
    );

    if (dist < minDist) {
      minDist = dist;
      nearest = edge;
    }
  }

  return nearest;
}
