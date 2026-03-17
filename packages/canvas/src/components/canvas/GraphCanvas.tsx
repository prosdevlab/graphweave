import { useCanvasContext } from "@contexts/CanvasContext";
import { useGraphStore } from "@store/graphSlice";
import { useUIStore } from "@store/uiSlice";
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  type Edge,
  type IsValidConnection,
  MarkerType,
  MiniMap,
  type Node,
  type NodeMouseHandler,
  type OnConnect,
  type OnEdgesChange,
  type OnNodesChange,
  type OnNodesDelete,
  type OnReconnect,
  ReactFlow,
  applyEdgeChanges,
  applyNodeChanges,
} from "@xyflow/react";
import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import { useNodeDrop } from "../../hooks/useNodeDrop";
import { useNodePlacement } from "../../hooks/useNodePlacement";
import { toRFEdge, toRFNode } from "../../types/mappers";
import { CanvasHint } from "./CanvasHint";
import { FloatingToolbar } from "./FloatingToolbar";
import { SnapConnectionLine } from "./SnapConnectionLine";
import { StampGhost } from "./StampGhost";
import { nodeTypes } from "./nodes/nodeTypes";

// ── Local RF state reducer ──────────────────────────────────────────

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
      return {
        ...state,
        nodes: applyNodeChanges(action.changes, state.nodes),
      };
    case "APPLY_EDGE_CHANGES":
      return {
        ...state,
        edges: applyEdgeChanges(action.changes, state.edges),
      };
    case "ADD_EDGE":
      return { ...state, edges: [...state.edges, action.edge] };
    default:
      return state;
  }
}

/** Default edge options — bezier with indigo arrowhead */
const defaultEdgeOptions = {
  type: "default",
  markerEnd: {
    type: MarkerType.ArrowClosed,
    width: 16,
    height: 16,
    color: "#52525b",
  },
  style: { strokeWidth: 2, stroke: "#52525b" },
};

// ── GraphCanvas ─────────────────────────────────────────────────────

export function GraphCanvas() {
  const storeNodes = useGraphStore((s) => s.nodes);
  const storeEdges = useGraphStore((s) => s.edges);
  const updateNodePosition = useGraphStore((s) => s.updateNodePosition);
  const addEdge = useGraphStore((s) => s.addEdge);
  const removeEdge = useGraphStore((s) => s.removeEdge);
  const removeNodes = useGraphStore((s) => s.removeNodes);

  const {
    selectedNodeId,
    setSelectedNodeId,
    reactFlowInstance,
    stampNodeType,
  } = useCanvasContext();
  const toastMessage = useUIStore((s) => s.toastMessage);
  const toastVariant = useUIStore((s) => s.toastVariant);
  const dismissToast = useUIStore((s) => s.dismissToast);
  const { onDragOver, onDrop } = useNodeDrop(reactFlowInstance);
  const { placeNode } = useNodePlacement();

  // Track the edge being reconnected to distinguish reconnect from new connection
  const reconnectingEdgeRef = useRef<string | null>(null);

  const [rfState, dispatch] = useReducer(rfReducer, {
    nodes: [],
    edges: [],
  });

  // Sync store → local RF state
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
      // Allow duplicate during reconnect (same edge being moved)
      if (reconnectingEdgeRef.current) return true;
      // Condition nodes can have multiple edges to the same target (different branches)
      if (sourceNode.type === "condition") return true;
      const duplicate = storeEdges.some(
        (e) => e.source === connection.source && e.target === connection.target,
      );
      if (duplicate) return false;
      return true;
    },
    [storeNodes, storeEdges],
  );

  const onNodesChange: OnNodesChange = useCallback(
    (changes) => {
      dispatch({ type: "APPLY_NODE_CHANGES", changes });
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
      if (!connection.source || !connection.target) return;
      const { nodes: storeNodesNow, edges: currentEdges } =
        useGraphStore.getState();
      const sourceNode = storeNodesNow.find((n) => n.id === connection.source);
      const isCondition = sourceNode?.type === "condition";

      let condition_branch: string | undefined;
      if (isCondition) {
        const existing = currentEdges
          .filter(
            (e): e is typeof e & { condition_branch: string } =>
              e.source === connection.source && !!e.condition_branch,
          )
          .map((e) => e.condition_branch);
        const maxN = existing.reduce((max, name) => {
          const m = name.match(/^branch_(\d+)$/);
          return m ? Math.max(max, Number(m[1])) : max;
        }, 0);
        condition_branch = `branch_${maxN + 1}`;
      }

      const edge = {
        id: crypto.randomUUID(),
        source: connection.source,
        target: connection.target,
        ...(condition_branch ? { condition_branch } : {}),
      };
      dispatch({ type: "ADD_EDGE", edge });
      addEdge(edge);
    },
    [addEdge],
  );

  // Edge reconnection — drag an existing edge to rewire it
  const onReconnectStart = useCallback(
    (_event: React.MouseEvent, edge: Edge) => {
      reconnectingEdgeRef.current = edge.id;
    },
    [],
  );

  const onReconnect: OnReconnect = useCallback(
    (oldEdge, newConnection) => {
      reconnectingEdgeRef.current = null;
      if (!newConnection.source || !newConnection.target) return;

      const { nodes: storeNodesNow, edges: currentEdges } =
        useGraphStore.getState();

      // Preserve condition_branch from old edge
      const oldStoreEdge = currentEdges.find((e) => e.id === oldEdge.id);
      let condition_branch = oldStoreEdge?.condition_branch;

      // If source changed, re-evaluate branch assignment
      if (newConnection.source !== oldEdge.source) {
        const newSourceNode = storeNodesNow.find(
          (n) => n.id === newConnection.source,
        );
        if (newSourceNode?.type === "condition") {
          const existing = currentEdges
            .filter(
              (e): e is typeof e & { condition_branch: string } =>
                e.source === newConnection.source && !!e.condition_branch,
            )
            .map((e) => e.condition_branch);
          const maxN = existing.reduce((max, name) => {
            const m = name.match(/^branch_(\d+)$/);
            return m ? Math.max(max, Number(m[1])) : max;
          }, 0);
          condition_branch = `branch_${maxN + 1}`;
        } else {
          condition_branch = undefined;
        }
      }

      removeEdge(oldEdge.id);
      addEdge({
        id: crypto.randomUUID(),
        source: newConnection.source,
        target: newConnection.target,
        ...(condition_branch ? { condition_branch } : {}),
      });
    },
    [removeEdge, addEdge],
  );

  const onReconnectEnd = useCallback(
    (_event: MouseEvent | TouchEvent, edge: Edge) => {
      if (reconnectingEdgeRef.current === edge.id) {
        removeEdge(edge.id);
        reconnectingEdgeRef.current = null;
      }
    },
    [removeEdge],
  );

  const onNodeClick: NodeMouseHandler = useCallback(
    (_event, node) => {
      setSelectedNodeId(node.id);
    },
    [setSelectedNodeId],
  );

  const onPaneClick = useCallback(
    (event: React.MouseEvent) => {
      if (stampNodeType && reactFlowInstance) {
        const flowPos = reactFlowInstance.screenToFlowPosition({
          x: event.clientX,
          y: event.clientY,
        });
        placeNode(stampNodeType, flowPos);
        return;
      }
      setSelectedNodeId(null);
    },
    [stampNodeType, reactFlowInstance, placeNode, setSelectedNodeId],
  );

  const onNodesDelete: OnNodesDelete = useCallback(
    (deleted) => {
      removeNodes(deleted.map((n) => n.id));
      setSelectedNodeId(null);
    },
    [removeNodes, setSelectedNodeId],
  );

  // Auto-dismiss toast after 3 seconds
  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(dismissToast, 3000);
    return () => clearTimeout(timer);
  }, [toastMessage, dismissToast]);

  return (
    <div className="relative h-full w-full">
      <ReactFlow
        nodes={rfState.nodes}
        edges={rfState.edges}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        connectionMode={ConnectionMode.Strict}
        connectionLineComponent={SnapConnectionLine}
        connectionLineStyle={{ strokeWidth: 2, stroke: "#52525b" }}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onReconnectStart={onReconnectStart}
        onReconnect={onReconnect}
        onReconnectEnd={onReconnectEnd}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        onNodesDelete={onNodesDelete}
        onDragOver={onDragOver}
        onDrop={onDrop}
        isValidConnection={isValidConnection}
        fitView
        deleteKeyCode="Delete"
        className={`bg-zinc-950 ${stampNodeType ? "cursor-crosshair" : ""}`}
      >
        <Background variant={BackgroundVariant.Dots} color="#3f3f46" gap={20} />
        <Controls className="!border-zinc-700 !bg-zinc-900" />
        <MiniMap
          className="!border-zinc-700 !bg-zinc-900"
          nodeColor="#3f3f46"
          maskColor="rgba(0, 0, 0, 0.7)"
        />
      </ReactFlow>
      <FloatingToolbar />
      <StampGhost />
      <CanvasHint nodeCount={storeNodes.length} />
      {toastMessage && (
        <output
          data-testid="canvas-toast"
          className={`absolute bottom-6 left-1/2 z-20 -translate-x-1/2 rounded-lg border px-4 py-2 text-sm shadow-lg backdrop-blur-sm ${
            toastVariant === "error"
              ? "border-red-800 bg-red-950/90 text-red-200"
              : toastVariant === "success"
                ? "border-emerald-800 bg-emerald-950/90 text-emerald-200"
                : "border-zinc-700 bg-zinc-900/90 text-zinc-200"
          }`}
        >
          {toastMessage}
        </output>
      )}
    </div>
  );
}
