import type { EdgeSchema, NodeSchema } from "@shared/schema";

/** Default configs for each C1 node type */
export const NODE_DEFAULTS: Record<string, () => Partial<NodeSchema>> = {
  start: () => ({
    type: "start" as const,
    label: "Start",
    config: {},
  }),
  llm: () => ({
    type: "llm" as const,
    label: "LLM",
    config: {
      provider: "gemini",
      model: "gemini-2.0-flash",
      system_prompt: "",
      temperature: 0.7,
      max_tokens: 1024,
      input_map: {},
      output_key: "llm_response",
    },
  }),
  tool: () => ({
    type: "tool" as const,
    label: "Tool",
    config: {
      tool_name: "",
      input_map: {},
      output_key: "tool_result",
    },
  }),
  condition: () => ({
    type: "condition" as const,
    label: "Condition",
    config: {
      condition: {
        type: "field_equals",
        field: "",
        value: "",
        branch: "yes",
      },
      branches: {} as Record<string, string>,
      default_branch: "",
    },
  }),
  human_input: () => ({
    type: "human_input" as const,
    label: "Human Input",
    config: {
      prompt: "Please provide input:",
      input_key: "user_input",
      timeout_ms: 300000,
    },
  }),
  end: () => ({
    type: "end" as const,
    label: "End",
    config: {},
  }),
};

/** Node types that can only appear once in a graph */
export const SINGLETON_TYPES = new Set(["start", "end"]);

/** Distance threshold (in flow coordinates) for drop-on-edge detection */
export const EDGE_DROP_THRESHOLD = 50;

/**
 * Calculate the minimum distance from a point to a line segment.
 * Used to detect if a dropped node is near an existing edge.
 */
export function distanceToSegment(
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

/**
 * Find the nearest edge to a position, if within threshold.
 * Uses node positions as edge endpoints (approximation for bezier curves).
 */
export function findNearestEdge(
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
