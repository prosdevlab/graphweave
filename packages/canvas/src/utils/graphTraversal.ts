import type { EdgeSchema, NodeSchema, StateField } from "@shared/schema";

/** Rewrite the root key in a state expression: "old[-1].content" → "new[-1].content" */
export function rewriteStateExpression(
  expr: string,
  oldKey: string,
  newKey: string,
): string {
  if (!expr || !oldKey || oldKey === newKey) return expr;
  if (expr === oldKey) return newKey;
  if (expr.startsWith(`${oldKey}[`) || expr.startsWith(`${oldKey}.`)) {
    return newKey + expr.slice(oldKey.length);
  }
  return expr;
}

/** Backward walk — returns all ancestor node IDs of `nodeId`. */
export function getUpstreamNodeIds(
  nodeId: string,
  edges: EdgeSchema[],
): Set<string> {
  // Build reverse adjacency list: target → [sources]
  const reverseAdj = new Map<string, string[]>();
  for (const edge of edges) {
    const list = reverseAdj.get(edge.target);
    if (list) list.push(edge.source);
    else reverseAdj.set(edge.target, [edge.source]);
  }

  const visited = new Set<string>([nodeId]);
  const upstream = new Set<string>();
  const queue = [nodeId];
  while (queue.length > 0) {
    // biome-ignore lint/style/noNonNullAssertion: queue.length > 0 guarantees pop() returns a value
    const current = queue.pop()!;
    for (const source of reverseAdj.get(current) ?? []) {
      if (!visited.has(source)) {
        visited.add(source);
        upstream.add(source);
        queue.push(source);
      }
    }
  }
  return upstream;
}

/**
 * Returns state fields relevant to a node's input dropdown:
 * - Input fields (not any node's output_key) — user-provided at runtime
 * - Output keys of UPSTREAM nodes only — available for wiring
 *
 * Excludes: the node's own output_key, downstream outputs, sibling outputs.
 */
export function getRelevantFields(
  nodeId: string,
  stateFields: StateField[],
  graphNodes: NodeSchema[],
  edges: EdgeSchema[],
): StateField[] {
  // All output keys across the graph
  const outputKeys = new Set<string>();
  for (const n of graphNodes) {
    if (n.type === "llm" || n.type === "tool") {
      outputKeys.add(n.config.output_key);
    }
  }

  // Output keys from upstream nodes only
  const upstreamIds = getUpstreamNodeIds(nodeId, edges);
  const upstreamOutputKeys = new Set<string>();
  for (const n of graphNodes) {
    if (!upstreamIds.has(n.id)) continue;
    if (n.type === "llm" || n.type === "tool") {
      upstreamOutputKeys.add(n.config.output_key);
    }
  }

  // Keep: input fields (not any node's output) + upstream outputs
  return stateFields.filter(
    (f) => !outputKeys.has(f.key) || upstreamOutputKeys.has(f.key),
  );
}

/** True if the node's only outgoing edges go to End nodes (or has none). */
export function isTerminalNode(
  nodeId: string,
  edges: EdgeSchema[],
  graphNodes: NodeSchema[],
): boolean {
  const outgoing = edges.filter((e) => e.source === nodeId);
  if (outgoing.length === 0) return true;
  return outgoing.every((e) => {
    const target = graphNodes.find((n) => n.id === e.target);
    return target?.type === "end";
  });
}
