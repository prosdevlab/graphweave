import type { NodeTypes } from "@xyflow/react";
import { EndNode } from "./EndNode";
import { LLMNode } from "./LLMNode";
import { StartNode } from "./StartNode";

/** React Flow nodeTypes registry — keys must match NodeSchema.type */
export const nodeTypes: NodeTypes = {
  start: StartNode,
  llm: LLMNode,
  end: EndNode,
} as const;
