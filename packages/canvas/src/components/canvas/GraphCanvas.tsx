import { useCanvasContext } from "@contexts/CanvasContext";
import { useGraphStore } from "@store/graphSlice";
import { SidebarProvider } from "@ui/Sidebar";
import {
  Background,
  BackgroundVariant,
  Controls,
  type IsValidConnection,
  MiniMap,
  type NodeMouseHandler,
  type OnConnect,
  type OnEdgesChange,
  type OnNodesChange,
  type OnNodesDelete,
  ReactFlow,
} from "@xyflow/react";
import { useCallback, useMemo } from "react";
import { useNodeDrop } from "../../hooks/useNodeDrop";
import { toRFEdge, toRFNode } from "../../types/mappers";
import { CanvasHint } from "./CanvasHint";
import { Toolbar } from "./Toolbar";
import { nodeTypes } from "./nodes/nodeTypes";

export function GraphCanvas() {
  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);
  const updateNodePosition = useGraphStore((s) => s.updateNodePosition);
  const addEdge = useGraphStore((s) => s.addEdge);
  const removeEdge = useGraphStore((s) => s.removeEdge);
  const removeNodes = useGraphStore((s) => s.removeNodes);
  const { selectedNodeId, setSelectedNodeId, reactFlowInstance } =
    useCanvasContext();
  const { onDragOver, onDrop } = useNodeDrop(reactFlowInstance);

  const rfNodes = useMemo(
    () =>
      nodes.map((n) => ({
        ...toRFNode(n),
        selected: n.id === selectedNodeId,
      })),
    [nodes, selectedNodeId],
  );
  const rfEdges = useMemo(() => edges.map(toRFEdge), [edges]);

  /** Connection validation: prevents invalid edges (US-7) */
  const isValidConnection: IsValidConnection = useCallback(
    (connection) => {
      const sourceNode = nodes.find((n) => n.id === connection.source);
      const targetNode = nodes.find((n) => n.id === connection.target);
      if (!sourceNode || !targetNode) return false;

      // Cannot connect to self
      if (connection.source === connection.target) return false;
      // Start nodes cannot be targets
      if (targetNode.type === "start") return false;
      // End nodes cannot be sources
      if (sourceNode.type === "end") return false;
      // No duplicate edges between same source/target
      const duplicate = edges.some(
        (e) => e.source === connection.source && e.target === connection.target,
      );
      if (duplicate) return false;

      return true;
    },
    [nodes, edges],
  );

  const onNodesChange: OnNodesChange = useCallback(
    (changes) => {
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
        addEdge({
          id: `e-${connection.source}-${connection.target}`,
          source: connection.source,
          target: connection.target,
        });
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
            nodes={rfNodes}
            edges={rfEdges}
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
          <CanvasHint nodeCount={nodes.length} />
        </div>
      </div>
    </SidebarProvider>
  );
}
