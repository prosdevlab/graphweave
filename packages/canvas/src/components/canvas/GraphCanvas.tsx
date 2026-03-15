import { useCanvasContext } from "@contexts/CanvasContext";
import { useGraphStore } from "@store/graphSlice";
import { SidebarProvider } from "@ui/Sidebar";
import {
  Background,
  BackgroundVariant,
  Controls,
  type Edge,
  type IsValidConnection,
  MiniMap,
  type Node,
  type NodeMouseHandler,
  type OnConnect,
  type OnEdgesChange,
  type OnNodesChange,
  type OnNodesDelete,
  ReactFlow,
  applyEdgeChanges,
  applyNodeChanges,
} from "@xyflow/react";
import { useCallback, useEffect, useMemo, useReducer } from "react";
import { useNodeDrop } from "../../hooks/useNodeDrop";
import { toRFEdge, toRFNode } from "../../types/mappers";
import { CanvasHint } from "./CanvasHint";
import { Toolbar } from "./Toolbar";
import { nodeTypes } from "./nodes/nodeTypes";

// ── Local RF state reducer ──────────────────────────────────────────
// React Flow works best when it owns the visual state (positions during
// drag, selection, dimensions). We use useReducer to apply RF changes
// locally and sync meaningful events back to Zustand.

interface RFState {
  nodes: Node[];
  edges: Edge[];
}

type RFAction =
  | { type: "SET_FROM_STORE"; nodes: Node[]; edges: Edge[] }
  | { type: "APPLY_NODE_CHANGES"; changes: Parameters<OnNodesChange>[0] }
  | { type: "APPLY_EDGE_CHANGES"; changes: Parameters<OnEdgesChange>[0] }
  | { type: "ADD_EDGE"; edge: Edge };

function rfReducer(state: RFState, action: RFAction): RFState {
  switch (action.type) {
    case "SET_FROM_STORE":
      return { nodes: action.nodes, edges: action.edges };
    case "APPLY_NODE_CHANGES":
      return { ...state, nodes: applyNodeChanges(action.changes, state.nodes) };
    case "APPLY_EDGE_CHANGES":
      return { ...state, edges: applyEdgeChanges(action.changes, state.edges) };
    case "ADD_EDGE":
      return { ...state, edges: [...state.edges, action.edge] };
    default:
      return state;
  }
}

// ── GraphCanvas ─────────────────────────────────────────────────────

export function GraphCanvas() {
  // Zustand (source of truth for persistence)
  const storeNodes = useGraphStore((s) => s.nodes);
  const storeEdges = useGraphStore((s) => s.edges);
  const updateNodePosition = useGraphStore((s) => s.updateNodePosition);
  const addEdge = useGraphStore((s) => s.addEdge);
  const removeEdge = useGraphStore((s) => s.removeEdge);
  const removeNodes = useGraphStore((s) => s.removeNodes);

  const { selectedNodeId, setSelectedNodeId, reactFlowInstance } =
    useCanvasContext();
  const { onDragOver, onDrop } = useNodeDrop(reactFlowInstance);

  // Local RF state (owns visual state during interactions)
  const [rfState, dispatch] = useReducer(rfReducer, {
    nodes: [],
    edges: [],
  });

  // Sync store → local RF state when store changes (load, add node, delete, etc.)
  const rfNodesFromStore = useMemo(
    () =>
      storeNodes.map((n) => ({
        ...toRFNode(n),
        selected: n.id === selectedNodeId,
      })),
    [storeNodes, selectedNodeId],
  );
  const rfEdgesFromStore = useMemo(
    () => storeEdges.map(toRFEdge),
    [storeEdges],
  );

  useEffect(() => {
    dispatch({
      type: "SET_FROM_STORE",
      nodes: rfNodesFromStore,
      edges: rfEdgesFromStore,
    });
  }, [rfNodesFromStore, rfEdgesFromStore]);

  // Connection validation
  const isValidConnection: IsValidConnection = useCallback(
    (connection) => {
      const sourceNode = storeNodes.find((n) => n.id === connection.source);
      const targetNode = storeNodes.find((n) => n.id === connection.target);
      if (!sourceNode || !targetNode) return false;
      if (connection.source === connection.target) return false;
      if (targetNode.type === "start") return false;
      if (sourceNode.type === "end") return false;
      const duplicate = storeEdges.some(
        (e) => e.source === connection.source && e.target === connection.target,
      );
      if (duplicate) return false;
      return true;
    },
    [storeNodes, storeEdges],
  );

  // RF applies changes locally for smooth interactions (drag, select, dimensions)
  // On drag end, sync final position back to Zustand
  const onNodesChange: OnNodesChange = useCallback(
    (changes) => {
      dispatch({ type: "APPLY_NODE_CHANGES", changes });

      // Sync position to store on drag end
      for (const change of changes) {
        if (
          change.type === "position" &&
          change.dragging === false &&
          change.position
        ) {
          updateNodePosition(change.id, change.position);
        }
      }
    },
    [updateNodePosition],
  );

  // RF applies edge changes locally, sync removals to store
  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => {
      dispatch({ type: "APPLY_EDGE_CHANGES", changes });

      for (const change of changes) {
        if (change.type === "remove") {
          removeEdge(change.id);
        }
      }
    },
    [removeEdge],
  );

  const onConnect: OnConnect = useCallback(
    (connection) => {
      if (connection.source && connection.target) {
        const edge = {
          id: `e-${connection.source}-${connection.target}`,
          source: connection.source,
          target: connection.target,
        };
        // Add to both local RF state and Zustand
        dispatch({ type: "ADD_EDGE", edge });
        addEdge(edge);
      }
    },
    [addEdge],
  );

  const onNodeClick: NodeMouseHandler = useCallback(
    (_event, node) => {
      setSelectedNodeId(node.id);
    },
    [setSelectedNodeId],
  );

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
  }, [setSelectedNodeId]);

  const onNodesDelete: OnNodesDelete = useCallback(
    (deleted) => {
      removeNodes(deleted.map((n) => n.id));
      setSelectedNodeId(null);
    },
    [removeNodes, setSelectedNodeId],
  );

  return (
    <SidebarProvider>
      <div className="flex h-full w-full">
        <Toolbar />
        <div className="relative flex-1">
          <ReactFlow
            nodes={rfState.nodes}
            edges={rfState.edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            onNodesDelete={onNodesDelete}
            onDragOver={onDragOver}
            onDrop={onDrop}
            isValidConnection={isValidConnection}
            fitView
            deleteKeyCode="Delete"
            className="bg-zinc-950"
          >
            <Background
              variant={BackgroundVariant.Dots}
              color="#3f3f46"
              gap={20}
            />
            <Controls className="!border-zinc-700 !bg-zinc-900" />
            <MiniMap
              className="!border-zinc-700 !bg-zinc-900"
              nodeColor="#3f3f46"
              maskColor="rgba(0, 0, 0, 0.7)"
            />
          </ReactFlow>
          <CanvasHint nodeCount={storeNodes.length} />
        </div>
      </div>
    </SidebarProvider>
  );
}
