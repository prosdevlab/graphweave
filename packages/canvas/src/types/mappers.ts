import type { EdgeSchema, NodeSchema } from "@shared/schema";
import type { Edge, Node } from "@xyflow/react";

/** Convert GraphSchema NodeSchema to React Flow Node */
export function toRFNode(node: NodeSchema): Node {
  return {
    id: node.id,
    type: node.type,
    position: node.position,
    data: node as unknown as Record<string, unknown>,
  };
}

/** Convert React Flow Node back to GraphSchema NodeSchema */
export function toNodeSchema(rfNode: Node): NodeSchema {
  return {
    ...(rfNode.data as unknown as NodeSchema),
    position: rfNode.position,
  } as NodeSchema;
}

/** Convert GraphSchema EdgeSchema to React Flow Edge */
export function toRFEdge(edge: EdgeSchema): Edge {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: edge.label,
  };
}

/** Convert React Flow Edge back to GraphSchema EdgeSchema */
export function toEdgeSchema(rfEdge: Edge): EdgeSchema {
  return {
    id: rfEdge.id,
    source: rfEdge.source,
    target: rfEdge.target,
    label: rfEdge.label as string | undefined,
  };
}
