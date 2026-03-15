# C1.3: GraphCanvas Container, Toolbar, graphSlice Extensions

## Commit

```
feat(canvas): add GraphCanvas container, Toolbar, and graphSlice extensions

- GraphCanvas: container component bridging React Flow <-> Zustand graphSlice
- Connection validation: prevents invalid edges (Start→Start, End→LLM, etc.)
- CanvasHint: contextual hint shown when canvas has ≤ 2 nodes
- Toolbar: drag-to-add buttons with tooltips for discoverability
- useNodeDrop hook: handles drop events, creates nodes at cursor position
- graphSlice extensions: updateNodePosition, addEdge, removeEdge, newGraph
  (with Start+End starter template), removeNodes
- RF <-> GraphSchema mapping utilities (toRFNode, toRFEdge, toNodeSchema)
- App.tsx updated to render GraphCanvas + Toolbar
```

## Files Touched

| Action | File |
|--------|------|
| modify | `packages/canvas/src/store/graphSlice.ts` |
| create | `packages/canvas/src/components/canvas/GraphCanvas.tsx` |
| create | `packages/canvas/src/components/canvas/Toolbar.tsx` |
| create | `packages/canvas/src/components/canvas/CanvasHint.tsx` |
| create | `packages/canvas/src/hooks/useNodeDrop.ts` |
| create | `packages/canvas/src/types/mappers.ts` |
| modify | `packages/canvas/src/App.tsx` |
| create | `packages/canvas/src/store/__tests__/graphSlice.test.ts` |
| create | `packages/canvas/src/types/__tests__/mappers.test.ts` |
| create | `packages/canvas/src/components/canvas/__tests__/Toolbar.test.tsx` |

---

## Detailed Todolist

### 1. Create mapping utilities

- [ ] Create `packages/canvas/src/types/mappers.ts`:

  ```typescript
  import type { Node, Edge } from "@xyflow/react";
  import type { NodeSchema, EdgeSchema } from "@shared/schema";

  /** Convert GraphSchema NodeSchema to React Flow Node */
  export function toRFNode(node: NodeSchema): Node<NodeSchema> {
    return {
      id: node.id,
      type: node.type,
      position: node.position,
      data: node,
    };
  }

  /** Convert React Flow Node back to GraphSchema NodeSchema */
  export function toNodeSchema(rfNode: Node<NodeSchema>): NodeSchema {
    return {
      ...rfNode.data,
      position: rfNode.position,
    } as NodeSchema;
  }

  /** Convert GraphSchema EdgeSchema to React Flow Edge */
  export function toRFEdge(edge: EdgeSchema): Edge {
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: edge.label,
    };
  }

  /** Convert React Flow Edge back to GraphSchema EdgeSchema */
  export function toEdgeSchema(rfEdge: Edge): EdgeSchema {
    return {
      id: rfEdge.id,
      source: rfEdge.source,
      target: rfEdge.target,
      label: rfEdge.label as string | undefined,
    };
  }
  ```

### 2. Extend graphSlice

- [ ] Modify `packages/canvas/src/store/graphSlice.ts`:

  Add these actions to the interface and implementation:

  ```typescript
  interface GraphSlice {
    // existing
    graph: GraphSchema | null;
    nodes: NodeSchema[];
    edges: EdgeSchema[];
    dirty: boolean;                   // NEW: tracks unsaved changes
    setGraph: (graph: GraphSchema) => void;
    addNode: (node: NodeSchema) => void;
    removeNode: (id: string) => void;

    // new in C1.3
    updateNodePosition: (id: string, position: { x: number; y: number }) => void;
    addEdge: (edge: EdgeSchema) => void;
    removeEdge: (id: string) => void;
    removeNodes: (ids: string[]) => void;
    newGraph: (name: string) => void;
  }
  ```

  Implementation details:
  - `updateNodePosition`: find node by id, update position, set `dirty: true`
  - `addEdge`: push to edges array, set `dirty: true`. Generate id as `e-${source}-${target}`
  - `removeEdge`: filter by id, set `dirty: true`
  - `removeNodes`: filter nodes by ids, also remove edges where source or target is in the ids set, set `dirty: true`
  - `newGraph`: create a new GraphSchema with `crypto.randomUUID()` as id, pre-placed Start + End nodes connected by an edge (**starter template**), default state (`messages` field), set `dirty: false`
  - `setGraph`: also sets `dirty: false` (loading an existing graph is not dirty)
  - `addNode`: sets `dirty: true`
  - `removeNode`: also removes connected edges, sets `dirty: true`

  - `renameGraph`: update `graph.name`, set `dirty: true`

  Default state and starter template for newGraph:
  ```typescript
  const DEFAULT_STATE: StateField[] = [
    { key: "messages", type: "list", reducer: "append", readonly: true },
  ];

  /** Pre-places Start + End connected by an edge so the user isn't staring at a blank canvas. */
  function createStarterNodes(): { nodes: NodeSchema[]; edges: EdgeSchema[] } {
    const startId = crypto.randomUUID();
    const endId = crypto.randomUUID();
    return {
      nodes: [
        { id: startId, type: "start", label: "Start", position: { x: 250, y: 200 }, config: {} },
        { id: endId, type: "end", label: "End", position: { x: 550, y: 200 }, config: {} },
      ] as NodeSchema[],
      edges: [
        { id: `e-${startId}-${endId}`, source: startId, target: endId },
      ],
    };
  }
  ```

### 3. Create useNodeDrop hook

- [ ] Create `packages/canvas/src/hooks/useNodeDrop.ts`:

  ```typescript
  import { useCallback, type DragEvent } from "react";
  import type { ReactFlowInstance } from "@xyflow/react";
  import type { NodeSchema } from "@shared/schema";
  import { useGraphStore } from "@store/graphSlice";

  /** Default configs for each C1 node type */
  const NODE_DEFAULTS: Record<string, () => Partial<NodeSchema>> = {
    start: () => ({
      type: "start" as const,
      label: "Start",
      config: {},
    }),
    llm: () => ({
      type: "llm" as const,
      label: "LLM",
      config: {
        provider: "openai",
        model: "gpt-4o",
        system_prompt: "",
        temperature: 0.7,
        max_tokens: 1024,
        input_map: {},
        output_key: "result",
      },
    }),
    end: () => ({
      type: "end" as const,
      label: "End",
      config: {},
    }),
  };

  export function useNodeDrop(reactFlowInstance: ReactFlowInstance | null) {
    const addNode = useGraphStore((s) => s.addNode);

    const onDragOver = useCallback((event: DragEvent) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
    }, []);

    const onDrop = useCallback(
      (event: DragEvent) => {
        event.preventDefault();
        if (!reactFlowInstance) return;

        const nodeType = event.dataTransfer.getData("application/graphweave-node-type");
        if (!nodeType || !NODE_DEFAULTS[nodeType]) return;

        const position = reactFlowInstance.screenToFlowPosition({
          x: event.clientX,
          y: event.clientY,
        });

        const defaults = NODE_DEFAULTS[nodeType]();
        const node: NodeSchema = {
          id: crypto.randomUUID(),
          position,
          ...defaults,
        } as NodeSchema;

        addNode(node);
      },
      [reactFlowInstance, addNode],
    );

    return { onDragOver, onDrop };
  }
  ```

### 4. Create Toolbar

- [ ] Create `packages/canvas/src/components/canvas/Toolbar.tsx`:

  ```typescript
  import { type DragEvent, memo, useCallback } from "react";
  import { Play, Brain, Square, type LucideIcon } from "lucide-react";
  import { Sidebar, SidebarContent, SidebarFooter, SidebarTrigger, useSidebar } from "@ui/Sidebar";
  import { Tooltip } from "@ui/Tooltip";

  interface ToolbarItem {
    type: string;
    label: string;
    icon: LucideIcon;
    accentClass: string;
    tooltip: string;
  }

  const TOOLBAR_ITEMS: ToolbarItem[] = [
    { type: "start", label: "Start", icon: Play, accentClass: "border-emerald-500", tooltip: "Entry point — drag to add" },
    { type: "llm", label: "LLM", icon: Brain, accentClass: "border-blue-500", tooltip: "AI model call — drag to add" },
    { type: "end", label: "End", icon: Square, accentClass: "border-red-500", tooltip: "Exit point — drag to add" },
  ];

  function ToolbarComponent() {
    const { collapsed } = useSidebar();

    const onDragStart = useCallback((event: DragEvent, nodeType: string) => {
      event.dataTransfer.setData("application/graphweave-node-type", nodeType);
      event.dataTransfer.effectAllowed = "move";
    }, []);

    return (
      <Sidebar>
        <SidebarContent>
          <div className="flex flex-col gap-1">
            {TOOLBAR_ITEMS.map((item) => (
              <Tooltip key={item.type} content={item.tooltip} side="right">
                <div
                  draggable
                  onDragStart={(e) => onDragStart(e, item.type)}
                  className={`flex cursor-grab items-center gap-2 rounded-md border-l-2 ${item.accentClass} px-2 py-2 text-xs text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 active:cursor-grabbing`}
                >
                  <item.icon size={14} className="shrink-0" />
                  {!collapsed && <span>{item.label}</span>}
                </div>
              </Tooltip>
            ))}
          </div>
        </SidebarContent>
        <SidebarFooter>
          <SidebarTrigger />
        </SidebarFooter>
      </Sidebar>
    );
  }

  export const Toolbar = memo(ToolbarComponent);
  ```

  The Toolbar uses the Sidebar component for consistent layout behavior:
  - Persistent left panel that's always visible
  - Collapses to icon-only mode via SidebarTrigger
  - Labels hidden when collapsed, icons always visible
  - Grows naturally as C3 adds Tool, Condition, HumanInput node types

### 5. Create GraphCanvas container

- [ ] Create `packages/canvas/src/components/canvas/GraphCanvas.tsx`:

  This is the **container component** that bridges React Flow and Zustand. It:
  1. Reads nodes/edges from graphSlice
  2. Converts them to RF format using mappers
  3. Handles RF callbacks (onNodesChange, onEdgesChange, onConnect)
  4. Translates RF events into graphSlice actions
  5. Tracks node selection via CanvasContext

  ```typescript
  import {
    ReactFlow,
    Background,
    Controls,
    MiniMap,
    type OnNodesChange,
    type OnEdgesChange,
    type OnConnect,
    type NodeMouseHandler,
    type OnNodesDelete,
    type IsValidConnection,
    BackgroundVariant,
  } from "@xyflow/react";
  import { useCallback, useMemo } from "react";
  import { useCanvasContext } from "@contexts/CanvasContext";
  import { useGraphStore } from "@store/graphSlice";
  import { toRFNode, toRFEdge } from "../../types/mappers";
  import { nodeTypes } from "./nodes/nodeTypes";
  import { SidebarProvider } from "@ui/Sidebar";
  import { Toolbar } from "./Toolbar";
  import { CanvasHint } from "./CanvasHint";
  import { useNodeDrop } from "../../hooks/useNodeDrop";

  export function GraphCanvas() {
    const nodes = useGraphStore((s) => s.nodes);
    const edges = useGraphStore((s) => s.edges);
    const updateNodePosition = useGraphStore((s) => s.updateNodePosition);
    const addEdge = useGraphStore((s) => s.addEdge);
    const removeEdge = useGraphStore((s) => s.removeEdge);
    const removeNodes = useGraphStore((s) => s.removeNodes);
    const { setSelectedNodeId, reactFlowInstance } = useCanvasContext();
    const { onDragOver, onDrop } = useNodeDrop(reactFlowInstance);

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

    const rfNodes = useMemo(
      () => nodes.map((n) => ({ ...toRFNode(n), selected: n.id === selectedNodeId })),
      [nodes, selectedNodeId],
    );
    const rfEdges = useMemo(() => edges.map(toRFEdge), [edges]);

    const onNodesChange: OnNodesChange = useCallback(
      (changes) => {
        for (const change of changes) {
          if (change.type === "position" && change.dragging === false && change.position) {
            // Sync final position to Zustand on drag end only (not every frame)
            updateNodePosition(change.id, change.position);
          }
        }
        // Note: We intentionally ignore 'select', 'dimensions', 'add', 'reset' changes.
        // Selection state lives in CanvasContext (not RF's built-in selection).
        // Since rfNodes are rebuilt from graphSlice on every render, RF's internal
        // state for these change types is reset each render anyway.
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
          <Background variant={BackgroundVariant.Dots} color="#3f3f46" gap={20} />
          <Controls className="!bg-zinc-900 !border-zinc-700" />
          <MiniMap
            className="!bg-zinc-900 !border-zinc-700"
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
  ```

  **Important: position updates during drag.** React Flow fires many `position` changes
  during a drag. We only sync position to graphSlice on drag end (`dragging === false`)
  to avoid unnecessary store updates on every frame. React Flow handles visual position
  during the drag internally. The rfNodes memo recalculates on store change, and
  React.memo on node components prevents unnecessary DOM updates.

### 6. Create CanvasHint

- [ ] Create `packages/canvas/src/components/canvas/CanvasHint.tsx`:

  A subtle hint overlay shown when the canvas has ≤ 2 nodes (just the starter
  Start+End template). Disappears once the user adds their first real node.

  ```typescript
  import { memo } from "react";

  interface CanvasHintProps {
    nodeCount: number;
  }

  function CanvasHintComponent({ nodeCount }: CanvasHintProps) {
    if (nodeCount > 2) return null;

    return (
      <div className="pointer-events-none absolute inset-x-0 bottom-16 flex justify-center">
        <div className="rounded-lg bg-zinc-800/80 px-4 py-2 text-xs text-zinc-400 backdrop-blur-sm">
          Drag nodes from the toolbar to build your graph
        </div>
      </div>
    );
  }

  export const CanvasHint = memo(CanvasHintComponent);
  ```

  - `pointer-events-none` so it doesn't block canvas interactions
  - Positioned at the bottom center, above the Controls
  - Fades context: shown only with ≤ 2 nodes (starter template)

### 7. Update App.tsx (temporary -- rewritten in 1.5)

- [ ] Rewrite `packages/canvas/src/App.tsx`:

  ```typescript
  import { ReactFlowProvider } from "@xyflow/react";
  import "@xyflow/react/dist/style.css";
  import { CanvasProvider } from "@contexts/CanvasContext";
  import { GraphCanvas } from "./components/canvas/GraphCanvas";

  export default function App() {
    return (
      <ReactFlowProvider>
        <CanvasProvider>
          <div className="h-screen w-screen bg-zinc-950 text-zinc-100">
            <header className="flex h-12 items-center border-b border-zinc-800 px-4">
              <h1 className="text-sm font-semibold">GraphWeave</h1>
            </header>
            <main className="h-[calc(100vh-3rem)]">
              <GraphCanvas />
            </main>
          </div>
        </CanvasProvider>
      </ReactFlowProvider>
    );
  }
  ```

  Note: Header is minimal here. It gets the save button and graph picker in C1.5.
  The NodeConfigPanel is added in C1.4. This commit produces a canvas where you
  can drag nodes from the toolbar, connect them, and move them around.

### 8. Write tests

- [ ] Create `packages/canvas/src/store/__tests__/graphSlice.test.ts`:

  Test graphSlice **without React** -- call actions directly on the store.

  - Test: `newGraph` creates a graph with default state (messages field)
  - Test: `newGraph` pre-places Start and End nodes connected by an edge (starter template)
  - Test: `newGraph` sets dirty to false
  - Test: `renameGraph` updates graph name and sets dirty to true
  - Test: `addNode` adds a node and sets dirty
  - Test: `removeNode` removes the node and its connected edges
  - Test: `updateNodePosition` updates position and sets dirty
  - Test: `addEdge` adds an edge with generated id
  - Test: `removeEdge` removes the edge
  - Test: `removeNodes` removes multiple nodes and their edges
  - Test: `setGraph` loads graph and sets dirty to false

  ```typescript
  import { useGraphStore } from "../graphSlice";

  // Reset store between tests
  beforeEach(() => {
    useGraphStore.setState({
      graph: null, nodes: [], edges: [], dirty: false,
    });
  });
  ```

- [ ] Create `packages/canvas/src/types/__tests__/mappers.test.ts`:
  - Test: `toRFNode` maps NodeSchema to RF Node with data
  - Test: `toNodeSchema` maps RF Node back, using RF position
  - Test: `toRFEdge` maps EdgeSchema to RF Edge
  - Test: `toEdgeSchema` maps RF Edge back
  - Test: roundtrip -- `toNodeSchema(toRFNode(node))` preserves data

- [ ] Create `packages/canvas/src/components/canvas/__tests__/Toolbar.test.tsx`:
  - Test: renders all three node type buttons
  - Test: each button is draggable
  - Test: dragStart sets correct data transfer type

  Mock for drag testing:
  ```typescript
  const mockDataTransfer = {
    setData: vi.fn(),
    effectAllowed: "",
  };
  ```

- [ ] Create `packages/canvas/src/components/canvas/__tests__/CanvasHint.test.tsx`:
  - Test: renders hint text when nodeCount ≤ 2
  - Test: renders nothing when nodeCount > 2

- [ ] Create `packages/canvas/src/hooks/__tests__/useBeforeUnload.test.ts`:
  - Test: adds beforeunload listener when dirty is true
  - Test: removes listener when dirty changes to false
  - Test: does not add listener when dirty is initially false

- [ ] Add connection validation tests to `packages/canvas/src/store/__tests__/graphSlice.test.ts`
  (or extract `isValidConnection` to a utility and test it directly):
  - Test: allows valid connection (Start → LLM)
  - Test: rejects self-connection (same source and target)
  - Test: rejects Start as target (LLM → Start)
  - Test: rejects End as source (End → LLM)
  - Test: rejects duplicate edge between same source/target

- [ ] Create `packages/canvas/src/hooks/__tests__/useNodeDrop.test.ts`:

  Test the useNodeDrop hook in isolation using `renderHook` from testing-library:

  - Test: `onDrop` with valid node type calls `addNode` with correct position and defaults
  - Test: `onDrop` with unknown node type does nothing (no `addNode` call)
  - Test: `onDrop` without reactFlowInstance does nothing
  - Test: `onDragOver` prevents default and sets dropEffect to "move"

  Mock `useGraphStore` and `reactFlowInstance.screenToFlowPosition`.

### 9. Verify

- [ ] Run `pnpm --filter @graphweave/canvas typecheck`
- [ ] Run `pnpm --filter @graphweave/canvas lint`
- [ ] Run `pnpm --filter @graphweave/canvas test`
- [ ] Run `pnpm --filter @graphweave/canvas dev` -- visually verify:
  - Canvas renders with dot background
  - Toolbar shows Start/LLM/End buttons
  - Drag a Start node onto canvas -- it appears
  - Drag an LLM node -- it shows provider/model badge
  - Connect Start -> LLM with edge drag
  - Delete a node with Delete key
  - MiniMap and Controls visible

---

## What Could Go Wrong

| Risk | Detection | Rollback |
|------|-----------|----------|
| Position update on every RF change causes lag with many nodes | Visual stutter when dragging with 20+ nodes | Debounce `updateNodePosition` with requestAnimationFrame |
| `CanvasProvider` inside `ReactFlowProvider` -- useReactFlow() may not be available immediately | Runtime error on mount | Ensure ReactFlowProvider wraps CanvasProvider. Add null check on reactFlowInstance in useNodeDrop |
| Import path `@contexts/CanvasContext` not resolved | tsc error | Verify tsconfig paths and vite alias from C1.1 include `@contexts` |
| `crypto.randomUUID()` not available in test env (jsdom) | Test failure | jsdom supports it in recent versions. If not, polyfill in test setup |
