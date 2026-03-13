/** GraphSchema — the contract between canvas and execution. */

export interface GraphSchema {
  id: string;
  name: string;
  description?: string;
  version: number;
  state: StateField[];
  nodes: NodeSchema[];
  edges: EdgeSchema[];
  metadata: {
    created_at: string;
    updated_at: string;
    author?: string;
  };
}

export interface StateField {
  key: string;
  type: "string" | "list" | "object" | "number" | "boolean";
  reducer: "replace" | "append" | "merge";
  default?: unknown;
  readonly?: boolean;
}

export interface EdgeSchema {
  id: string;
  source: string;
  target: string;
  label?: string;
  condition_branch?: string;
}

export type NodeSchema =
  | StartNode
  | LLMNode
  | ToolNode
  | ConditionNode
  | HumanInputNode
  | EndNode;

export interface BaseNode {
  id: string;
  type: NodeSchema["type"];
  label: string;
  position: { x: number; y: number };
  notes?: string;
}

export interface StartNode extends BaseNode {
  type: "start";
  config: Record<string, never>;
}

export interface EndNode extends BaseNode {
  type: "end";
  config: Record<string, never>;
}

export interface LLMNode extends BaseNode {
  type: "llm";
  config: {
    provider: "gemini" | "openai" | "anthropic";
    model: string;
    system_prompt: string;
    temperature: number;
    max_tokens: number;
    input_map: Record<string, string>;
    output_key: string;
  };
}

export interface ToolNode extends BaseNode {
  type: "tool";
  config: {
    tool_name: string;
    input_map: Record<string, string>;
    output_key: string;
  };
}

export type ConditionConfig =
  | { type: "field_equals"; field: string; value: string; branch: string }
  | { type: "field_contains"; field: string; value: string; branch: string }
  | { type: "field_exists"; field: string; branch: string }
  | {
      type: "llm_router";
      prompt: string;
      options: string[];
      routing_model?: string;
    }
  | { type: "tool_error"; on_error: string; on_success: string }
  | {
      type: "iteration_limit";
      field: string;
      max: number;
      exceeded: string;
      continue: string;
    };

export interface ConditionNode extends BaseNode {
  type: "condition";
  config: {
    condition: ConditionConfig;
    branches: Record<string, string>;
    default_branch: string;
  };
}

export interface HumanInputNode extends BaseNode {
  type: "human_input";
  config: {
    prompt: string;
    input_key: string;
    timeout_ms?: number;
  };
}
