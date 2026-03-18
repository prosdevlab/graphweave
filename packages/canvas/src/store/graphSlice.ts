import {
  createGraph,
  deleteGraph,
  getGraph,
  listGraphs,
  updateGraph,
} from "@api/graphs";
import type {
  EdgeSchema,
  GraphSchema,
  NodeSchema,
  StateField,
} from "@shared/schema";
import { useUIStore } from "@store/uiSlice";
import { create } from "zustand";

const DEFAULT_STATE: StateField[] = [
  { key: "messages", type: "list", reducer: "append", readonly: true },
  { key: "llm_response", type: "string", reducer: "replace" },
];

/** Pre-places Start + End connected by an edge so the user isn't staring at a blank canvas. */
function createStarterNodes(): {
  nodes: NodeSchema[];
  edges: EdgeSchema[];
} {
  const startId = crypto.randomUUID();
  const endId = crypto.randomUUID();
  return {
    nodes: [
      {
        id: startId,
        type: "start",
        label: "Start",
        position: { x: 250, y: 200 },
        config: {},
      },
      {
        id: endId,
        type: "end",
        label: "End",
        position: { x: 550, y: 200 },
        config: {},
      },
    ] as NodeSchema[],
    edges: [{ id: `e-${startId}-${endId}`, source: startId, target: endId }],
  };
}

export interface GraphSlice {
  graph: GraphSchema | null;
  nodes: NodeSchema[];
  edges: EdgeSchema[];
  dirty: boolean;
  persisted: boolean;
  saving: boolean;
  saveError: string | null;

  setGraph: (graph: GraphSchema) => void;
  addNode: (node: NodeSchema) => void;
  removeNode: (id: string) => void;
  updateNodePosition: (id: string, position: { x: number; y: number }) => void;
  addEdge: (edge: EdgeSchema) => void;
  removeEdge: (id: string) => void;
  updateEdge: (id: string, updates: Partial<EdgeSchema>) => void;
  spliceEdge: (
    oldEdgeId: string,
    newNode: NodeSchema,
    newEdge1: EdgeSchema,
    newEdge2: EdgeSchema,
  ) => void;
  removeNodes: (ids: string[]) => void;
  addStateFields: (fields: StateField[]) => void;
  removeStateFields: (keys: string[]) => void;
  newGraph: (name: string) => void;
  renameGraph: (name: string) => void;
  updateNodeConfig: (
    id: string,
    updates: { label?: string; config?: Record<string, unknown> },
  ) => void;
  saveGraph: () => Promise<void>;
  loadGraph: (id: string) => Promise<void>;
  loadGraphList: () => Promise<GraphSchema[]>;
  deleteGraphById: (id: string) => Promise<void>;
  renameGraphById: (id: string, name: string) => Promise<GraphSchema>;
}

export const useGraphStore = create<GraphSlice>((set, get) => ({
  graph: null,
  nodes: [],
  edges: [],
  dirty: false,
  persisted: false,
  saving: false,
  saveError: null,

  setGraph: (graph) =>
    set({ graph, nodes: graph.nodes, edges: graph.edges, dirty: false }),

  addNode: (node) => set((s) => ({ nodes: [...s.nodes, node], dirty: true })),

  removeNode: (id) =>
    set((s) => ({
      nodes: s.nodes.filter((n) => n.id !== id),
      edges: s.edges.filter((e) => e.source !== id && e.target !== id),
      dirty: true,
    })),

  updateNodePosition: (id, position) =>
    set((s) => ({
      nodes: s.nodes.map((n) => (n.id === id ? { ...n, position } : n)),
      dirty: true,
    })),

  addEdge: (edge) => set((s) => ({ edges: [...s.edges, edge], dirty: true })),

  removeEdge: (id) =>
    set((s) => ({
      edges: s.edges.filter((e) => e.id !== id),
      dirty: true,
    })),

  updateEdge: (id, updates) =>
    set((s) => ({
      edges: s.edges.map((e) => (e.id === id ? { ...e, ...updates } : e)),
      dirty: true,
    })),

  spliceEdge: (oldEdgeId, newNode, newEdge1, newEdge2) =>
    set((s) => ({
      nodes: [...s.nodes, newNode],
      edges: [...s.edges.filter((e) => e.id !== oldEdgeId), newEdge1, newEdge2],
      dirty: true,
    })),

  removeNodes: (ids) => {
    const idSet = new Set(ids);
    set((s) => ({
      nodes: s.nodes.filter((n) => !idSet.has(n.id)),
      edges: s.edges.filter(
        (e) => !idSet.has(e.source) && !idSet.has(e.target),
      ),
      dirty: true,
    }));
  },

  addStateFields: (fields) =>
    set((s) => {
      if (!s.graph) return {};
      const existing = new Set(s.graph.state.map((f) => f.key));
      const fresh = fields.filter((f) => !existing.has(f.key));
      if (fresh.length === 0) return {};
      return {
        graph: { ...s.graph, state: [...s.graph.state, ...fresh] },
        dirty: true,
      };
    }),

  removeStateFields: (keys) =>
    set((s) => {
      if (!s.graph) return {};
      const remove = new Set(keys);
      return {
        graph: {
          ...s.graph,
          state: s.graph.state.filter((f) => !remove.has(f.key) || f.readonly),
        },
        dirty: true,
      };
    }),

  newGraph: (name) => {
    const { nodes, edges } = createStarterNodes();
    set({
      graph: {
        id: crypto.randomUUID(),
        name,
        description: "",
        version: 1,
        state: DEFAULT_STATE,
        nodes,
        edges,
        metadata: { created_at: "", updated_at: "" },
      },
      nodes,
      edges,
      dirty: false,
      persisted: false,
      saving: false,
      saveError: null,
    });
  },

  renameGraph: (name) =>
    set((s) => ({
      graph: s.graph ? { ...s.graph, name } : null,
      dirty: true,
    })),

  // Note: Start/End nodes have Record<string, never> configs.
  // Config updates should be empty for them. The cast is safe
  // because we never change node type via this action.
  updateNodeConfig: (id, updates) =>
    set((s) => ({
      dirty: true,
      nodes: s.nodes.map((n) =>
        n.id === id
          ? {
              ...n,
              ...(updates.label !== undefined ? { label: updates.label } : {}),
              ...(updates.config !== undefined
                ? { config: { ...n.config, ...updates.config } }
                : {}),
            }
          : n,
      ) as NodeSchema[],
    })),

  saveGraph: async () => {
    const state = get();
    if (!state.graph) return;

    set({ saving: true, saveError: null });
    try {
      // Derive config.branches for condition nodes from their outgoing edges
      const syncedNodes = state.nodes.map((node) => {
        if (node.type !== "condition") return node;
        const outEdges = state.edges.filter(
          (e): e is typeof e & { condition_branch: string } =>
            e.source === node.id && !!e.condition_branch,
        );
        const branches: Record<string, string> = {};
        for (const e of outEdges) {
          branches[e.condition_branch] = e.target;
        }
        return { ...node, config: { ...node.config, branches } };
      });

      // Auto-register output_keys from llm/tool nodes as state fields
      const existingStateKeys = new Set(state.graph.state.map((f) => f.key));
      const extraStateFields: StateField[] = [];
      for (const node of syncedNodes) {
        if (node.type !== "llm" && node.type !== "tool") continue;
        const outputKey = (node.config as Record<string, unknown>).output_key as
          | string
          | undefined;
        if (outputKey && !existingStateKeys.has(outputKey)) {
          existingStateKeys.add(outputKey);
          extraStateFields.push({
            key: outputKey,
            type: node.type === "llm" ? "string" : "object",
            reducer: "replace",
          });
        }
      }
      const syncedState = [...state.graph.state, ...extraStateFields];

      const schema: Omit<GraphSchema, "id" | "metadata"> = {
        name: state.graph.name,
        description: state.graph.description,
        version: state.graph.version,
        state: syncedState,
        nodes: syncedNodes as typeof state.nodes,
        edges: state.edges,
      };

      const saved = state.persisted
        ? await updateGraph(state.graph.id, schema)
        : await createGraph(schema);

      set({
        graph: saved,
        nodes: saved.nodes,
        edges: saved.edges,
        dirty: false,
        saving: false,
        persisted: true,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Save failed";
      set({ saveError: message, saving: false });
      useUIStore.getState().showToast(message, "error");
    }
  },

  loadGraph: async (id) => {
    set({ graph: null, saveError: null });
    try {
      const graph = await getGraph(id);
      set({
        graph,
        nodes: graph.nodes,
        edges: graph.edges,
        dirty: false,
        saveError: null,
        persisted: true,
      });
    } catch (e) {
      set({
        saveError: e instanceof Error ? e.message : "Load failed",
      });
    }
  },

  loadGraphList: async () => {
    return listGraphs();
  },

  deleteGraphById: async (id) => {
    await deleteGraph(id);
  },

  renameGraphById: async (id, name) => {
    return updateGraph(id, { name });
  },
}));
