import type { NodeTypes } from "@xyflow/react";
import { ConditionNode } from "./ConditionNode";
import { EndNode } from "./EndNode";
import { HumanInputNode } from "./HumanInputNode";
import { LLMNode } from "./LLMNode";
import { StartNode } from "./StartNode";
import { ToolNode } from "./ToolNode";

/** React Flow nodeTypes registry — keys must match NodeSchema.type */
export const nodeTypes: NodeTypes = {
  start: StartNode,
  llm: LLMNode,
  tool: ToolNode,
  condition: ConditionNode,
  human_input: HumanInputNode,
  end: EndNode,
} as const;
