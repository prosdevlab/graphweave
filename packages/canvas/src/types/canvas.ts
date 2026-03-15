import type { NodeSchema } from "@shared/schema";
import type { Edge, Node } from "@xyflow/react";

/**
 * React Flow node with NodeSchema as data.
 * RF's Node<T> requires T extends Record<string, unknown>,
 * but NodeSchema is a discriminated union — use type assertion at usage site.
 */
export type CanvasNode = Node<Record<string, unknown>>;

/** React Flow edge -- structurally same as EdgeSchema for C1 */
export type CanvasEdge = Edge;

/** Supported node types for C1 */
export type C1NodeType = "start" | "llm" | "end";
