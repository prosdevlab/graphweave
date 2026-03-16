# C1: Core Canvas -- Overview

## Context

The execution backend (Phases 1-5) is complete. The canvas package has scaffolding:
React 19, React Flow v12, Zustand 5, Tailwind 4, Vite 6, path aliases, layer rules,
API stubs (`client.ts`, `graphs.ts`, `runs.ts`), store slices (`graphSlice.ts`,
`runSlice.ts`, `uiSlice.ts`), and an `App.tsx` shell with `ReactFlowProvider`.

C1 delivers the **minimum viable canvas**: render Start/LLM/End nodes on a React Flow
canvas, connect them with edges, save/load graphs via the API, and configure nodes
in a side panel. This is the foundation every later canvas phase builds on.

---

## User Stories

```
US-1  As a new user, I see a home screen with my graphs (or an empty
      state prompting me to create one), so I know where to start.

US-2  As a user, I can create a new graph by clicking "New Graph",
      giving it a name, and landing on a canvas with a Start and
      End node pre-placed, so I'm not staring at a blank canvas.

US-3  As a user, I can drag LLM nodes from the toolbar onto the
      canvas and connect them between Start and End by dragging
      edges between handles, so I can build a flow visually.

US-4  As a user, I can click any node to open its config panel,
      edit its properties, and see changes reflected on the canvas
      immediately, so I get instant feedback.

US-5  As a user, I can save my graph and come back to it later
      by selecting it from the home screen, so my work persists.

US-6  As a user, I can rename my graph by clicking the name in the
      header, so I can organize my work.

US-7  As a user, I see clear visual feedback when connecting nodes:
      valid targets highlight green, invalid targets are rejected,
      so I can't create broken graphs accidentally.
```

---

## UI Flow

```
┌──────────────────────────────────────────────────────────────────┐
│                        APP FLOW (C1)                             │
│                                                                  │
│  ┌─────────────┐     click graph     ┌──────────────────────┐   │
│  │             │ ──────────────────> │                      │   │
│  │  Home View  │                     │    Canvas View       │   │
│  │  (graph     │ <────────────────── │    (graph editor)    │   │
│  │   list)     │     click logo /    │                      │   │
│  │             │     back button     │                      │   │
│  └──────┬──────┘                     └──────────────────────┘   │
│         │                                                        │
│    click "New Graph"                                             │
│         │                                                        │
│         ▼                                                        │
│  ┌─────────────┐                                                 │
│  │ Name dialog │ ──── enter name ──> Canvas View                │
│  │ (modal)     │                     (with Start + End           │
│  └─────────────┘                      pre-placed + connected)   │
└──────────────────────────────────────────────────────────────────┘

View routing is a simple state in uiSlice: currentView: "home" | "canvas"
No React Router needed for C1. Just conditional rendering in App.
```

### Home View

```
┌─────────────────────────────────────────────────────────────────┐
│  GraphWeave                                      [+ New Graph]  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Your Graphs                                                     │
│                                                                  │
│  ┌──────────────────┐  ┌──────────────────┐  ┌────────────────┐ │
│  │ ┌──┐──┌──┐──┌──┐│  │ ┌──┐──┌──┐       │  │                │ │
│  │ │S │  │L │  │E ││  │ │S │  │E │       │  │  + New Graph   │ │
│  │ └──┘  └──┘  └──┘│  │ └──┘  └──┘       │  │                │ │
│  │                   │  │                  │  │  Start building │ │
│  │ Search Pipeline   │  │ My First Graph   │  │  your first    │ │
│  │ 3 nodes           │  │ 2 nodes          │  │  AI workflow   │ │
│  │ Edited 2 hrs ago  │  │ Edited yesterday │  │                │ │
│  └──────────────────┘  └──────────────────┘  └────────────────┘ │
│                                                                  │
│  Empty state (when no graphs exist):                             │
│  ┌──────────────────────────────────────────────────────────────┐│
│  │                                                              ││
│  │         No graphs yet                                        ││
│  │                                                              ││
│  │    ┌──┐ ─── ┌──┐ ─── ┌──┐                                  ││
│  │    │▶ │     │✦ │     │⏹│    Create your first AI workflow  ││
│  │    └──┘     └──┘     └──┘                                   ││
│  │                                                              ││
│  │              [+ New Graph]                                   ││
│  └──────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

### Canvas View

```
┌─────────────────────────────────────────────────────────────────┐
│  ◀ GraphWeave   │ My Graph [✎] *│                      [Save]  │
├───────┬─────────────────────────────────────────┬───────────────┤
│       │                                         │               │
│ ┌───┐ │                                         │  Config Panel │
│ │ ▶ │ │     ┌───────────┐      ┌───────────┐   │  (slide-in)   │
│ │   │ │     │   Start   │─────▶│    End    │   │               │
│ ├───┤ │     └───────────┘      └───────────┘   │ ┌───────────┐ │
│ │ ✦ │ │                                         │ │ Label     │ │
│ │   │ │          Drag nodes from the toolbar    │ │ [Chat   ] │ │
│ ├───┤ │          to add them to your graph      │ │ Provider  │ │
│ │ ⏹ │ │                                         │ │ [OpenAI ▾]│ │
│ │   │ │                                         │ │ Model     │ │
│ └───┘ │                                         │ │ [gpt-4o ▾]│ │
│  drag │                                         │ └───────────┘ │
│  to   │  ┌──────────┐             ┌──────────┐ │               │
│  add  │  │ Controls │             │ MiniMap  │ │               │
│       │  └──────────┘             └──────────┘ │               │
├───────┴─────────────────────────────────────────┴───────────────┤
│  ◀ = back to home    ✎ = click name to rename    * = unsaved   │
│  Canvas hint shown only when graph has ≤ 2 nodes               │
│  Config panel shown only when a node is selected               │
└─────────────────────────────────────────────────────────────────┘
```

### New Graph Dialog

```
┌──────────────────────────────────────────────┐
│  New Graph                               [X] │
├──────────────────────────────────────────────┤
│                                              │
│  Name                                        │
│  ┌──────────────────────────────────────┐    │
│  │ My Graph                             │    │
│  └──────────────────────────────────────┘    │
│                                              │
│                     [Cancel]  [Create Graph]  │
└──────────────────────────────────────────────┘
```

---

## Architecture

### UI Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│  Header (h-12, border-b)                                            │
│  ┌──────────┐  ┌──────────────────┐          ┌────┐ ┌────┐ ┌─────┐ │
│  │GraphWeave│  │ My Graph *       │          │New │ │Open│ │Save │ │
│  └──────────┘  └──────────────────┘          └────┘ └────┘ └─────┘ │
├───────┬─────────────────────────────────────────────┬───────────────┤
│       │                                             │               │
│ Tool  │              React Flow Canvas              │  Config Panel │
│ bar   │              (dot background)               │  (slide-in)   │
│       │                                             │               │
│ ┌───┐ │        ┌───────────┐                        │ ┌───────────┐ │
│ │ ▶ │ │        │   Start   │──────┐                 │ │ Label     │ │
│ │   │ │        └───────────┘      │                 │ │ [Chat   ] │ │
│ ├───┤ │                           ▼                 │ ├───────────┤ │
│ │ ✦ │ │                    ┌────────────┐           │ │ Provider  │ │
│ │   │ │                    │ LLM        │           │ │ [OpenAI ▾]│ │
│ ├───┤ │                    │ openai/4o  │           │ │ Model     │ │
│ │ ⏹ │ │                    └────────────┘           │ │ [gpt-4o ▾]│ │
│ │   │ │                           │                 │ │ System    │ │
│ └───┘ │                           ▼                 │ │ [You are ]│ │
│       │                    ┌───────────┐            │ │ Temp: 0.7 │ │
│       │                    │    End    │            │ │ Tokens:1k │ │
│       │                    └───────────┘            │ └───────────┘ │
│       │                                             │               │
│       │  ┌──────────┐                ┌──────────┐   │               │
│       │  │ Controls │                │ MiniMap  │   │               │
│       │  └──────────┘                └──────────┘   │               │
├───────┴─────────────────────────────────────────────┴───────────────┤
│  * = unsaved changes                     Config panel shown when    │
│  Toolbar: drag node type onto canvas     a node is selected         │
└─────────────────────────────────────────────────────────────────────┘
```

### Layer Boundaries

```
┌──────────────────────────────────────────────────────────────────┐
│  Components Layer                                                │
│  (components/canvas/, components/panels/, components/ui/)         │
│                                                                  │
│  ┌─ Containers ──────────────┐  ┌─ Presenters ────────────────┐ │
│  │ GraphCanvas               │  │ StartNode, LLMNode, EndNode │ │
│  │ NodeConfigPanel           │  │ StartNodeConfig, LLMNodeConfig│
│  │ Header, GraphPicker       │  │ EndNodeConfig               │ │
│  │                           │  │ Button, Input, Select       │ │
│  │ CAN read: @store, @ui,   │  │                             │ │
│  │   @contexts               │  │ Props only. No store.       │ │
│  │ CANNOT: @api, fetch()     │  │ No hooks. No side effects.  │ │
│  └───────────┬───────────────┘  └─────────────────────────────┘ │
│              │ calls actions                                     │
├──────────────┼───────────────────────────────────────────────────┤
│  Store Layer │     (store/)                                      │
│              ▼                                                   │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ graphSlice: nodes, edges, graph, dirty, persisted           │ │
│  │   actions: addNode, removeNode, updateNodePosition,         │ │
│  │            addEdge, removeEdge, saveGraph, loadGraph,       │ │
│  │            updateNodeConfig, newGraph                       │ │
│  │                                                             │ │
│  │ uiSlice: darkMode, panelLayout          (untouched in C1)  │ │
│  │ runSlice: runStatus, activeNodeId       (untouched in C1)  │ │
│  │                                                             │ │
│  │ CAN call: @api                                              │ │
│  └─────────────────────────┬───────────────────────────────────┘ │
│                            │ calls                               │
├────────────────────────────┼─────────────────────────────────────┤
│  API Layer                 │     (api/)                          │
│                            ▼                                     │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ client.ts: request<T>(path, options)  -- base fetch wrapper │ │
│  │ graphs.ts: listGraphs, getGraph, createGraph, updateGraph   │ │
│  │ runs.ts: startRun, connectStream             (untouched)    │ │
│  │                                                             │ │
│  │ Pure async. No React. No state.                             │ │
│  └─────────────────────────┬───────────────────────────────────┘ │
│                            │ fetch()                             │
├────────────────────────────┼─────────────────────────────────────┤
│  Execution Backend         ▼     (FastAPI @ localhost:8000)      │
│  /v1/graphs, /v1/graphs/:id, /v1/graphs/:id/run                 │
└──────────────────────────────────────────────────────────────────┘

tsc --noEmit enforces: components → store ✓  components → api ✗
```

### Component Tree

```
<App>
  currentView === "home":
    <HomeView />                                 -- graph list, empty state, new graph CTA
      <GraphCard />                              -- dumb: graph name, node count, last edited
    <NewGraphDialog />                           -- modal: name input, create button

  currentView === "canvas":
    <ReactFlowProvider>                          -- @xyflow/react (already exists)
      <CanvasProvider>                           -- NEW: CanvasContext (selected node, RF instance)
        <CanvasHeader />                         -- back button, editable graph name, save
        <main>
          <Toolbar />                            -- node type buttons with tooltips
          <GraphCanvas />                        -- container: wires RF <-> Zustand
            <ReactFlow>
              <StartNode />                      -- dumb: props only
              <LLMNode />                        -- dumb: props only
              <EndNode />                        -- dumb: props only
              <Background />
              <Controls />
              <MiniMap />
            </ReactFlow>
            <CanvasHint />                       -- "Drag nodes..." hint when ≤ 2 nodes
          <NodeConfigPanel />                    -- container: reads CanvasContext
            <StartNodeConfig />                  -- dumb: props + callbacks
            <LLMNodeConfig />                    -- dumb: props + callbacks
            <EndNodeConfig />                    -- dumb: props + callbacks
        </main>
      </CanvasProvider>
    </ReactFlowProvider>
</App>
```

### Data Flow

```
                    Zustand (graphSlice)
                   /        |          \
           nodes[]      edges[]      graph metadata
              |            |
              v            v
         GraphCanvas (container)
         - converts NodeSchema[] -> ReactFlow Node[]
         - converts EdgeSchema[] -> ReactFlow Edge[]
         - passes to <ReactFlow nodes={} edges={} />
              |
              v
         ReactFlow (internal state)
         - user drags/connects/deletes
         - fires onNodesChange, onConnect, onNodesDelete
              |
              v
         GraphCanvas callbacks
         - translate RF events -> graphSlice actions
         - addNode, removeNode, updateNodePosition, addEdge, removeEdge

         User clicks a node
              |
              v
         CanvasContext.setSelectedNodeId(id)
              |
              v
         NodeConfigPanel reads selectedNodeId from context
         - looks up node data from graphSlice
         - renders the right config form
         - form changes -> graphSlice.updateNodeConfig()
```

### Context API vs Zustand Split

```
+---------------------------+-----------------------------------+
|     React Context         |          Zustand                  |
+---------------------------+-----------------------------------+
| CanvasContext:             | graphSlice:                       |
|   selectedNodeId           |   graph, nodes[], edges[]         |
|   setSelectedNodeId()      |   setGraph, addNode, removeNode   |
|   reactFlowInstance        |   updateNodePosition              |
|                            |   updateNodeConfig, addEdge       |
|                            |   removeEdge, saveGraph           |
|                            |   loadGraph, newGraph             |
|                            |                                   |
|                            | uiSlice:                          |
|                            |   darkMode, panelLayout           |
|                            |   currentView ("home" | "canvas") |
|                            |                                   |
|                            | runSlice:                         |
|                            |   (untouched in C1)               |
+---------------------------+-----------------------------------+
```

**Why this split**: `selectedNodeId` is UI-local state -- it determines which panel
is showing but has no meaning outside the canvas page. It changes frequently (every
click) and should not trigger re-renders in components that don't care about it.
Context scopes the re-renders to the panel subtree. Graph data is global app state --
it persists across views, drives save/load, and is consumed by the run system later.

### ReactFlow <-> GraphSchema Mapping

React Flow uses its own `Node<T>` and `Edge<T>` types. We need a thin mapping layer:

```typescript
// GraphSchema NodeSchema -> React Flow Node
function toRFNode(node: NodeSchema): Node<NodeSchema> {
  return {
    id: node.id,
    type: node.type,         // matches our nodeTypes registry key
    position: node.position,
    data: node,              // full NodeSchema as data -- node components receive this
  };
}

// React Flow Node -> GraphSchema NodeSchema (for save)
function toNodeSchema(rfNode: Node<NodeSchema>): NodeSchema {
  return {
    ...rfNode.data,
    position: rfNode.position,  // RF is the authority on position
  };
}

// EdgeSchema maps 1:1 -- same id/source/target shape
function toRFEdge(edge: EdgeSchema): Edge {
  return { id: edge.id, source: edge.source, target: edge.target, label: edge.label };
}
```

### Node Handle Configuration

```
StartNode:     [ ] ---- source (right)        -- can only connect outward
                         no target handle

EndNode:       target (left) ---- [ ]          -- can only receive
                                   no source handle

LLMNode:       target (left) ---- [ ] ---- source (right)   -- both directions
```

### File Layout (C1 final state)

```
packages/canvas/src/
  components/
    canvas/
      GraphCanvas.tsx          -- container: RF <-> Zustand bridge
      CanvasHeader.tsx         -- back button, editable name, save button
      CanvasHint.tsx           -- "Drag nodes..." hint for nearly-empty canvas
      GraphPicker.tsx          -- dropdown to load a saved graph (has business logic)
      nodes/
        StartNode.tsx          -- dumb presenter
        LLMNode.tsx            -- dumb presenter
        EndNode.tsx            -- dumb presenter
        nodeTypes.ts           -- React Flow nodeTypes registry
        BaseNodeShell.tsx      -- shared node chrome (border, label, handles)
      Toolbar.tsx              -- add-node buttons with tooltips
    home/
      HomeView.tsx             -- graph list + empty state
      GraphCard.tsx            -- dumb presenter: graph thumbnail card
      NewGraphDialog.tsx       -- modal: name input, create button
    panels/
      NodeConfigPanel.tsx      -- container: reads context, dispatches to config forms
      config/
        StartNodeConfig.tsx    -- dumb form (label only)
        LLMNodeConfig.tsx      -- dumb form (provider, model, system prompt, temp, etc.)
        EndNodeConfig.tsx      -- dumb form (label only)
    ui/
      Button.tsx               -- shadcn-style button
      Input.tsx                -- shadcn-style input
      Select.tsx               -- shadcn-style select
      Textarea.tsx             -- shadcn-style textarea
      Dialog.tsx               -- shadcn-style dialog/modal (native <dialog>)
      Sheet.tsx                -- shadcn-style slide-over panel (config panel)
      Sidebar.tsx              -- shadcn-style collapsible sidebar (toolbar)
      Tooltip.tsx              -- shadcn-style tooltip (CSS-only)
      Card.tsx                 -- shadcn-style card (graph cards)
  contexts/
    CanvasContext.tsx           -- selectedNodeId + RF instance
  store/
    graphSlice.ts              -- EXTENDED: updateNodePosition, updateNodeConfig,
                                  addEdge, removeEdge, saveGraph, loadGraph,
                                  newGraph (with starter template), renameGraph
    runSlice.ts                -- untouched
    uiSlice.ts                 -- EXTENDED: currentView ("home" | "canvas"),
                                  setView, newGraphDialogOpen
  api/
    client.ts                  -- untouched
    graphs.ts                  -- ADD: updateGraph, deleteGraph
    runs.ts                    -- untouched
  hooks/
    useNodeDrop.ts             -- drop handler for toolbar drag-to-canvas
    useBeforeUnload.ts         -- warns on tab close with unsaved changes
  types/
    canvas.ts                  -- RF-specific type helpers
    mappers.ts                 -- NodeSchema <-> RF Node converters
  App.tsx                      -- REWRITTEN: view routing (home | canvas)
  main.tsx                     -- untouched
  index.css                    -- ADD: node styles, pulse animation, panel transitions
```

---

## Engineering Decisions

| # | Decision | Alternatives considered | Rationale |
|---|----------|------------------------|-----------|
| 1 | **Context for selectedNodeId** | Zustand atom; useState in App | Context scopes re-renders to panel subtree. Zustand would cause unnecessary re-renders in unrelated subscribers. useState would require prop drilling. |
| 2 | **Full NodeSchema as RF node data** | Separate data shape; minimal data + lookup | Keeps node components self-contained. No secondary lookups. NodeSchema is small (< 500 bytes). Tradeoff: RF re-renders on any config change, but node components are pure so React.memo handles it. |
| 3 | **BaseNodeShell wrapper** | Inline handle/border in each node | DRY. All nodes share: border, label, selected highlight, handles (configurable). Node-specific content is a child. |
| 4 | **Container/Presenter for GraphCanvas and NodeConfigPanel** | Single component with hooks | Testable: presenters are pure components with props. Containers hold the hooks/context wiring. Matches the "dumb components" requirement. |
| 5 | **Vitest + testing-library** | Jest; Playwright component tests | Vitest is native to Vite (shared config, fast). testing-library aligns with "test what the user sees." No need for Playwright at the component level in C1. |
| 6 | **Minimal shadcn-style UI components** | Full shadcn install; Headless UI; raw HTML | Copy-owned per CLAUDE.md. Only 4 components needed for C1. No dependency, no bundle bloat. |
| 7 | **graphSlice as single Zustand store (not split)** | Separate stores per concern | graphSlice already exists. Adding actions to it is simpler than splitting. The store is small -- splitting adds import complexity without performance benefit at this scale. |
| 8 | **Drag from toolbar to canvas (not click-to-add)** | Click toolbar button to add at center; right-click menu | Drag-to-drop is the standard React Flow pattern. `onDrop` + `screenToFlowPosition` is well-documented. Click-to-add can be added later as a shortcut. |
| 9 | **Home view with React Router v7 URL routing** | React Router; always-canvas with dropdown graph picker | Originally deferred to C6 as simple state-driven routing. Pulled forward because shareable `/graph/:id` URLs, browser back/forward, and nested route support (run history, settings) were needed sooner. React Router v7 library mode — no loaders/actions, data stays in Zustand. |
| 10 | **Starter template (Start+End pre-placed)** | Blank canvas; full template with LLM node | Start+End are always required. Pre-placing them removes a mandatory step. Including LLM would be opinionated -- let the user choose what goes between. |
| 11 | **Editable graph name in header** | Separate rename dialog; settings page | Inline editing is the most natural UX -- click text, type, done. No extra modals for a simple rename. |
| 12 | **Connection validation via isValidConnection** | No validation; validate on save | Immediate feedback prevents bad graphs. Matches US-7. RF's `isValidConnection` is the standard hook for this. |

---

## Parts

| Part | File | Commits | Summary |
|------|------|---------|---------|
| 1.1 | [phase-1.1-test-infra-ui-base.md](phase-1.1-test-infra-ui-base.md) | 1 | Test infra (Vitest + testing-library), lucide-react, 9 shadcn UI components (Button, Input, Select, Textarea, Dialog, Sheet, Sidebar, Tooltip, Card), CanvasContext |
| 1.2 | [phase-1.2-node-components.md](phase-1.2-node-components.md) | 1 | BaseNodeShell + Start/LLM/End node presenters + nodeTypes registry |
| 1.3 | [phase-1.3-graph-canvas.md](phase-1.3-graph-canvas.md) | 1 | GraphCanvas container, Toolbar with tooltips, connection validation, canvas hint, starter template, graphSlice extensions |
| 1.4 | [phase-1.4-config-panel.md](phase-1.4-config-panel.md) | 1 | NodeConfigPanel with slide transition + config forms + graphSlice.updateNodeConfig |
| 1.5 | [phase-1.5-save-load.md](phase-1.5-save-load.md) | 1 | HomeView, GraphCard, NewGraphDialog, editable graph name, save/load, view routing, App rewrite |
| 1.6 | [phase-1.6-floating-toolbar.md](phase-1.6-floating-toolbar.md) | 2 | Floating toolbar with stamp mode, replaces sidebar toolbar |

Each part produces an independently buildable and typecheckable codebase. Parts 1.1-1.2
can be demoed in Storybook-like isolation. Part 1.3 produces a working canvas (add nodes,
connect them, drag them) with a starter template. Part 1.4 adds configuration. Part 1.5
adds the home screen, persistence, and the full app flow.

---

## Not in Scope

- **Tool, Condition, HumanInput nodes** -- C3
- **SSE streaming / run panel** -- C2
- **Graph validation (client-side)** -- C4
- **Undo/redo** -- C6
- **Auto-save** -- future
- **Dark mode toggle** -- uiSlice exists but toggle UI is C6
- **Edge labels / condition branches** -- C3
- **Custom edge types** -- C3 (condition edges need visual distinction)
- **State panel (view/edit LangGraph state fields)** -- C4
- **CodeMirror integration** -- C5
- **Keyboard shortcuts** -- C6
- **Mobile/responsive layout** -- not v1
- **Node copy/paste** -- future
- **Graph templates** -- future

---

## Decisions & Risks

| Decision / Risk | Mitigation |
|-----------------|------------|
| React Flow v12 + React 19 compatibility | @xyflow/react ^12.4.4 explicitly supports React 19. Already in package.json. |
| Node components receive full NodeSchema as data | React.memo on node components prevents unnecessary re-renders. NodeSchema is small. |
| No auto-save -- user can lose work | Save button is prominent in header. Browser beforeunload warning if dirty. Auto-save is a C6 item. |
| graphSlice stores canonical data, RF stores visual state (positions during drag) | GraphCanvas syncs positions back to graphSlice on `onNodesChange` (position type only). RF is the authority on position during interaction. |
| Testing React Flow custom nodes requires mocking ReactFlowProvider | BaseNodeShell and node presenters tested in isolation without RF. GraphCanvas integration tested minimally with RF mocks. |
| shadcn-style components are copy-owned (not a package) | 4 small components. Easy to maintain. No version drift. |
| `pnpm add` for test deps may trigger interactive prompt | Use `pnpm.onlyBuiltDependencies` in package.json per memory note. |
| graphSlice currently uses separate Zustand `create()` calls per slice | Keep this pattern for C1. Merging into a single store is a refactor that can happen later if needed. |

---

## Verification (all parts)

```bash
# Typecheck
cd /Users/prosdev/workspace/graphweave && pnpm --filter @graphweave/canvas typecheck

# Lint
cd /Users/prosdev/workspace/graphweave && pnpm --filter @graphweave/canvas lint

# Test
cd /Users/prosdev/workspace/graphweave && pnpm --filter @graphweave/canvas test

# Dev server (visual verification)
cd /Users/prosdev/workspace/graphweave && pnpm --filter @graphweave/canvas dev
```
