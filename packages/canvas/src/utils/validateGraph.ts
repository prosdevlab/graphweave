import type {
  ConditionNode,
  EdgeSchema,
  HumanInputNode,
  NodeSchema,
  ToolNode,
} from "@shared/schema";

const EXHAUSTIVE_CONDITION_TYPES = new Set(["tool_error", "iteration_limit"]);

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

  // 6-7. Tool nodes: tool_name and output_key must not be empty
  for (const node of nodes) {
    if (node.type !== "tool") continue;
    const toolNode = node as ToolNode;
    if (!toolNode.config.tool_name?.trim()) {
      errors.push({
        nodeId: node.id,
        message: `${node.label || "Tool"} node needs a tool selected`,
      });
    }
    if (!toolNode.config.output_key?.trim()) {
      errors.push({
        nodeId: node.id,
        message: `${node.label || "Tool"} node needs an output key`,
      });
    }
  }

  // 8-10. Condition node edge and branch validation
  for (const node of nodes) {
    if (node.type !== "condition") continue;
    const condNode = node as ConditionNode;
    const outEdges = edges.filter((e) => e.source === node.id);

    // Rule 8: must have at least one outgoing edge with condition_branch
    const branchedEdges = outEdges.filter((e) => e.condition_branch);
    if (branchedEdges.length === 0) {
      errors.push({
        nodeId: node.id,
        message: `${node.label || "Condition"} node has no outgoing branch edges`,
      });
      continue;
    }

    // Rule 9: all outgoing edges must have condition_branch set
    const unnamedEdges = outEdges.filter((e) => !e.condition_branch);
    if (unnamedEdges.length > 0) {
      errors.push({
        nodeId: node.id,
        message: `${node.label || "Condition"} node has edges without branch names`,
      });
    }

    // Rule 10: default_branch validation
    const conditionType = condNode.config.condition?.type ?? "";
    const isExhaustive = EXHAUSTIVE_CONDITION_TYPES.has(conditionType);
    if (!isExhaustive) {
      const defaultBranch = condNode.config.default_branch;
      const validBranches = new Set(
        branchedEdges.map((e) => e.condition_branch),
      );
      if (!defaultBranch?.trim()) {
        errors.push({
          nodeId: node.id,
          message: `${node.label || "Condition"} node needs a default branch`,
        });
      } else if (!validBranches.has(defaultBranch)) {
        errors.push({
          nodeId: node.id,
          message: `${node.label || "Condition"} node default branch does not match any edge branch`,
        });
      }
    }
  }

  // 11-12. HumanInput nodes: prompt and input_key must not be empty
  for (const node of nodes) {
    if (node.type !== "human_input") continue;
    const hiNode = node as HumanInputNode;
    if (!hiNode.config.prompt?.trim()) {
      errors.push({
        nodeId: node.id,
        message: `${node.label || "Human Input"} node needs a prompt`,
      });
    }
    if (!hiNode.config.input_key?.trim()) {
      errors.push({
        nodeId: node.id,
        message: `${node.label || "Human Input"} node needs an input key`,
      });
    }
  }

  return errors;
}
