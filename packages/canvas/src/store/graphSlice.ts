import type { EdgeSchema, GraphSchema, NodeSchema } from "@shared/schema";
import { create } from "zustand";

export interface GraphSlice {
  graph: GraphSchema | null;
  nodes: NodeSchema[];
  edges: EdgeSchema[];
  setGraph: (graph: GraphSchema) => void;
  addNode: (node: NodeSchema) => void;
  removeNode: (id: string) => void;
}

export const useGraphStore = create<GraphSlice>((set) => ({
  graph: null,
  nodes: [],
  edges: [],
  setGraph: (graph) => set({ graph, nodes: graph.nodes, edges: graph.edges }),
  addNode: (node) => set((s) => ({ nodes: [...s.nodes, node] })),
  removeNode: (id) =>
    set((s) => ({ nodes: s.nodes.filter((n) => n.id !== id) })),
}));
