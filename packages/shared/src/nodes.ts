/** Node type constants and utilities. */

export const NODE_TYPES = [
  "start",
  "end",
  "llm",
  "tool",
  "condition",
  "human_input",
] as const;

export type NodeType = (typeof NODE_TYPES)[number];
