import type { EdgeSchema, NodeSchema } from "@shared/schema";

export interface ValidationError {
  message: string;
  nodeId?: string;
}

/** Client-side graph validation — fast feedback before hitting the server. */
export function validateGraph(
  nodes: NodeSchema[],
  edges: EdgeSchema[],
): ValidationError[] {
  const errors: ValidationError[] = [];

  // 1. Exactly one Start node
  const starts = nodes.filter((n) => n.type === "start");
  if (starts.length === 0) {
    errors.push({ message: "Start node required" });
  } else if (starts.length > 1 && starts[1]) {
    errors.push({
      message: "Only one Start node allowed",
      nodeId: starts[1].id,
    });
  }

  // 2. At least one End node
  const ends = nodes.filter((n) => n.type === "end");
  if (ends.length === 0) {
    errors.push({ message: "End node required" });
  }

  // 3. All non-end nodes have at least one outgoing edge
  const nodesWithOutgoing = new Set(edges.map((e) => e.source));
  for (const node of nodes) {
    if (node.type === "end") continue;
    if (!nodesWithOutgoing.has(node.id)) {
      errors.push({
        nodeId: node.id,
        message: `${node.label || node.type} node has no outgoing edge`,
      });
    }
  }

  // 4. All non-start nodes have at least one incoming edge
  const nodesWithIncoming = new Set(edges.map((e) => e.target));
  for (const node of nodes) {
    if (node.type === "start") continue;
    if (!nodesWithIncoming.has(node.id)) {
      errors.push({
        nodeId: node.id,
        message: `${node.label || node.type} node has no incoming edge`,
      });
    }
  }

  // 5. LLM nodes have a system prompt
  for (const node of nodes) {
    if (node.type === "llm" && !node.config.system_prompt?.trim()) {
      errors.push({
        nodeId: node.id,
        message: `${node.label || "LLM"} node needs a system prompt`,
      });
    }
  }

  return errors;
}
