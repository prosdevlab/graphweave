import type { EdgeSchema, NodeSchema } from "@shared/schema";
import type { Edge, Node } from "@xyflow/react";

/** Canonical edge data stored in RF edge.data for lossless round-trips */
export type GWEdgeData = {
  condition_branch?: string;
  label?: string;
};

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
export function toRFEdge(edge: EdgeSchema): Edge<GWEdgeData> {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    // RF label is display-only — condition_branch takes priority
    label: edge.condition_branch ?? edge.label,
    // Store canonical values in data for lossless round-trip
    data: { condition_branch: edge.condition_branch, label: edge.label },
  };
}

/** Convert React Flow Edge back to GraphSchema EdgeSchema */
export function toEdgeSchema(rfEdge: Edge<GWEdgeData>): EdgeSchema {
  return {
    id: rfEdge.id,
    source: rfEdge.source,
    target: rfEdge.target,
    // Read original label from data, not RF label (which may show condition_branch)
    label: rfEdge.data?.label,
    condition_branch: rfEdge.data?.condition_branch,
  };
}
