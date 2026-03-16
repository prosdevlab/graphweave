# Phase 1.5: Home View, Save/Load, Editable Name, App Flow

## Commit

```
feat(canvas): add home view, save/load, editable graph name, and app flow

- HomeView: graph card grid with empty state and "New Graph" CTA
- GraphCard: dumb presenter showing graph name, node count, last edited
- NewGraphDialog: modal for naming a new graph before creation
- CanvasHeader: back button, editable graph name, save button, dirty indicator
- uiSlice: currentView routing ("home" | "canvas"), newGraphDialogOpen
- graphSlice: saveGraph, loadGraph, loadGraphList, deleteGraph actions
- beforeunload warning when dirty
- App.tsx: view routing between home and canvas views
- Tests for all new components and store actions
```

## Files Touched

| Action | File |
|--------|------|
| modify | `packages/canvas/src/api/graphs.ts` |
| modify | `packages/canvas/src/store/graphSlice.ts` |
| modify | `packages/canvas/src/store/uiSlice.ts` |
| create | `packages/canvas/src/components/home/HomeView.tsx` |
| create | `packages/canvas/src/components/home/GraphCard.tsx` |
| create | `packages/canvas/src/components/home/NewGraphDialog.tsx` |
| create | `packages/canvas/src/components/canvas/CanvasHeader.tsx` |
| modify | `packages/canvas/src/App.tsx` |
| create | `packages/canvas/src/hooks/useBeforeUnload.ts` |
| create | `packages/canvas/src/store/__tests__/graphSlice.saveLoad.test.ts` |
| create | `packages/canvas/src/store/__tests__/uiSlice.test.ts` |
| create | `packages/canvas/src/components/home/__tests__/HomeView.test.tsx` |
| create | `packages/canvas/src/components/home/__tests__/GraphCard.test.tsx` |
| create | `packages/canvas/src/components/home/__tests__/NewGraphDialog.test.tsx` |
| create | `packages/canvas/src/__tests__/App.test.tsx` |
| create | `packages/canvas/src/components/canvas/__tests__/CanvasHeader.test.tsx` |

---

## Detailed Todolist

### 1. Update API service layer

- [ ] Modify `packages/canvas/src/api/graphs.ts` -- add:

  ```typescript
  interface PaginatedResponse<T> {
    items: T[];
    total: number;
    limit: number;
    offset: number;
    has_more: boolean;
  }

  export async function listGraphs(): Promise<GraphSchema[]> {
    const response = await request<PaginatedResponse<GraphSchema>>("/graphs");
    return response.items;
  }

  export async function updateGraph(
    id: string,
    graph: Partial<Omit<GraphSchema, "id" | "metadata">>,
  ): Promise<GraphSchema> {
    return request<GraphSchema>(`/graphs/${id}`, {
      method: "PUT",
      body: JSON.stringify(graph),
    });
  }

  export async function deleteGraph(id: string): Promise<void> {
    await request<void>(`/graphs/${id}`, { method: "DELETE" });
  }
  ```

### 2. Extend uiSlice with view routing

- [ ] Modify `packages/canvas/src/store/uiSlice.ts`:

  ```typescript
  type AppView = "home" | "canvas";

  interface UISlice {
    // existing
    darkMode: boolean;
    panelLayout: "right" | "bottom";
    lastOpenedGraphId: string | null;
    toggleDarkMode: () => void;
    setPanelLayout: (layout: "right" | "bottom") => void;
    setLastOpenedGraphId: (id: string | null) => void;

    // new in 1.5
    currentView: AppView;
    setView: (view: AppView) => void;
    newGraphDialogOpen: boolean;
    setNewGraphDialogOpen: (open: boolean) => void;
  }
  ```

  Implementation:
  ```typescript
  currentView: "home",
  setView: (view) => set({ currentView: view }),
  newGraphDialogOpen: false,
  setNewGraphDialogOpen: (open) => set({ newGraphDialogOpen: open }),
  ```

  View routing is a simple state toggle -- no React Router needed for 2 views.
  `setView("canvas")` is called after creating or loading a graph.
  `setView("home")` is called from the back button in CanvasHeader.

### 3. Add save/load actions to graphSlice

- [ ] Add to `GraphSlice` interface:
  ```typescript
  persisted: boolean;          // true when graph exists on server
  saving: boolean;
  saveError: string | null;
  saveGraph: () => Promise<void>;
  loadGraph: (id: string) => Promise<void>;
  loadGraphList: () => Promise<GraphSchema[]>;
  deleteGraphById: (id: string) => Promise<void>;
  ```

- [ ] Implementation:

  ```typescript
  persisted: false,
  saving: false,
  saveError: null,

  saveGraph: async () => {
    const state = get();
    if (!state.graph) return;

    set({ saving: true, saveError: null });
    try {
      const schema: Omit<GraphSchema, "id" | "metadata"> = {
        name: state.graph.name,
        description: state.graph.description,
        version: state.graph.version,
        state: state.graph.state,
        nodes: state.nodes,
        edges: state.edges,
      };

      let saved: GraphSchema;
      if (state.persisted) {
        saved = await updateGraph(state.graph.id, schema);
      } else {
        saved = await createGraph(schema);
      }

      set({
        graph: saved, nodes: saved.nodes, edges: saved.edges,
        dirty: false, saving: false, persisted: true,
      });
    } catch (e) {
      set({ saveError: e instanceof Error ? e.message : "Save failed", saving: false });
    }
  },

  loadGraph: async (id) => {
    try {
      const graph = await getGraph(id);
      set({
        graph, nodes: graph.nodes, edges: graph.edges,
        dirty: false, saveError: null, persisted: true,
      });
    } catch (e) {
      set({ saveError: e instanceof Error ? e.message : "Load failed" });
    }
  },

  loadGraphList: async () => {
    return listGraphs();
  },

  deleteGraphById: async (id) => {
    await deleteGraph(id);
  },
  ```

  Note: `graphSlice` needs `create((set, get) => ({ ... }))` to access `get()`.

  **Distinguishing new vs saved graphs**: The store tracks `persisted: boolean`
  (client-only state, not part of GraphSchema). `newGraph` sets `persisted: false`.
  `saveGraph` and `loadGraph` set `persisted: true` on success. `saveGraph` uses
  `persisted` to decide `createGraph` vs `updateGraph`.

  Update `newGraph` to use starter template + persisted flag:
  ```typescript
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
  ```

### 4. Create useBeforeUnload hook

- [ ] Create `packages/canvas/src/hooks/useBeforeUnload.ts`:

  ```typescript
  import { useEffect } from "react";
  import { useGraphStore } from "@store/graphSlice";

  /** Warns the user before closing/navigating away with unsaved changes. */
  export function useBeforeUnload() {
    const dirty = useGraphStore((s) => s.dirty);

    useEffect(() => {
      if (!dirty) return;

      const handler = (e: BeforeUnloadEvent) => {
        e.preventDefault();
      };

      window.addEventListener("beforeunload", handler);
      return () => window.removeEventListener("beforeunload", handler);
    }, [dirty]);
  }
  ```

### 5. Create GraphCard (dumb presenter)

- [ ] Create `packages/canvas/src/components/home/GraphCard.tsx`:

  A card showing graph name, node count, and last edited time. Pure presenter --
  receives all data as props. Uses the shadcn-style Card component.

  ```typescript
  import { memo } from "react";
  import { Card, CardContent, CardFooter } from "@ui/Card";

  interface GraphCardProps {
    name: string;
    nodeCount: number;
    updatedAt: string;        // ISO 8601 timestamp
    onClick: () => void;
  }

  function GraphCardComponent({ name, nodeCount, updatedAt, onClick }: GraphCardProps) {
    const timeAgo = formatTimeAgo(updatedAt);

    return (
      <Card interactive onClick={onClick}>
        <CardContent>
          {/* Mini graph preview placeholder -- colored dots representing nodes */}
          <div className="mb-3 flex h-12 items-center justify-center gap-2">
            <div className="h-3 w-3 rounded-full bg-emerald-500/60" />
            {Array.from({ length: Math.min(nodeCount - 2, 3) }, (_, i) => (
              <div key={i} className="h-3 w-3 rounded-full bg-blue-500/60" />
            ))}
            <div className="h-3 w-3 rounded-full bg-red-500/60" />
          </div>
          <h3 className="truncate text-sm font-medium text-zinc-100">{name}</h3>
        </CardContent>
        <CardFooter>
          <span>{nodeCount} nodes</span>
          <span className="mx-1">·</span>
          <span>{timeAgo}</span>
        </CardFooter>
      </Card>
    );
  }

  export const GraphCard = memo(GraphCardComponent);

  /** Simple relative time formatting. No dependency needed. */
  function formatTimeAgo(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const minutes = Math.floor(diff / 60_000);
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(iso).toLocaleDateString();
  }
  ```

  The mini preview shows colored dots matching the node type accent colors
  (green=start, blue=llm/tool, red=end). It's not a true graph preview --
  that would require React Flow rendering, which is heavy. The dots give
  a visual sense of graph complexity at a glance.

### 6. Create NewGraphDialog

- [ ] Create `packages/canvas/src/components/home/NewGraphDialog.tsx`:

  Modal dialog for naming a new graph before creation. Uses the shadcn-style
  Dialog component. Controlled by `uiSlice.newGraphDialogOpen`.

  ```typescript
  import { memo, useCallback, useState } from "react";
  import { useGraphStore } from "@store/graphSlice";
  import { useUIStore } from "@store/uiSlice";
  import { Dialog } from "@ui/Dialog";
  import { Input } from "@ui/Input";
  import { Button } from "@ui/Button";

  function NewGraphDialogComponent() {
    const open = useUIStore((s) => s.newGraphDialogOpen);
    const setOpen = useUIStore((s) => s.setNewGraphDialogOpen);
    const setView = useUIStore((s) => s.setView);
    const newGraph = useGraphStore((s) => s.newGraph);
    const [name, setName] = useState("");

    const handleClose = useCallback(() => {
      setOpen(false);
      setName("");
    }, [setOpen]);

    const handleCreate = useCallback(() => {
      const graphName = name.trim() || "Untitled Graph";
      newGraph(graphName);
      setOpen(false);
      setView("canvas");
      setName("");
    }, [name, newGraph, setOpen, setView]);

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        if (e.key === "Enter") handleCreate();
      },
      [handleCreate],
    );

    return (
      <Dialog open={open} onClose={handleClose} title="New Graph">
        <div className="space-y-4">
          <div>
            <label htmlFor="graph-name" className="mb-1 block text-xs font-medium text-zinc-400">
              Name
            </label>
            <Input
              id="graph-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="My Graph"
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={handleClose}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleCreate}>
              Create Graph
            </Button>
          </div>
        </div>
      </Dialog>
    );
  }

  export const NewGraphDialog = memo(NewGraphDialogComponent);
  ```

  UX details:
  - Enter key submits (no need to click the button)
  - Empty name defaults to "Untitled Graph"
  - Auto-focuses the input when dialog opens
  - Clears the input when dialog closes

### 7. Create HomeView

- [ ] Create `packages/canvas/src/components/home/HomeView.tsx`:

  The landing screen. Shows a grid of saved graphs or an empty state for new users.
  This is a container component -- it calls store actions.

  ```typescript
  import { useCallback, useEffect, useState } from "react";
  import type { GraphSchema } from "@shared/schema";
  import { useGraphStore } from "@store/graphSlice";
  import { useUIStore } from "@store/uiSlice";
  import { Play, Brain, Square, Plus } from "lucide-react";
  import { Button } from "@ui/Button";
  import { GraphCard } from "./GraphCard";
  import { NewGraphDialog } from "./NewGraphDialog";

  export function HomeView() {
    const [graphs, setGraphs] = useState<GraphSchema[]>([]);
    const [loading, setLoading] = useState(true);
    const loadGraphList = useGraphStore((s) => s.loadGraphList);
    const loadGraph = useGraphStore((s) => s.loadGraph);
    const setView = useUIStore((s) => s.setView);
    const setNewGraphDialogOpen = useUIStore((s) => s.setNewGraphDialogOpen);

    useEffect(() => {
      loadGraphList()
        .then(setGraphs)
        .catch(() => setGraphs([]))
        .finally(() => setLoading(false));
    }, [loadGraphList]);

    const handleSelectGraph = useCallback(
      async (id: string) => {
        await loadGraph(id);
        setView("canvas");
      },
      [loadGraph, setView],
    );

    const handleNewGraph = useCallback(() => {
      setNewGraphDialogOpen(true);
    }, [setNewGraphDialogOpen]);

    return (
      <div className="flex h-screen flex-col bg-zinc-950 text-zinc-100">
        {/* Header */}
        <header className="flex h-12 items-center justify-between border-b border-zinc-800 px-6">
          <h1 className="text-sm font-semibold">GraphWeave</h1>
          <Button variant="primary" onClick={handleNewGraph}>
            <Plus size={14} className="mr-1" /> New Graph
          </Button>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto px-6 py-6">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <span className="text-sm text-zinc-500">Loading...</span>
            </div>
          ) : graphs.length === 0 ? (
            /* Empty state */
            <div className="flex flex-col items-center justify-center py-20">
              <div className="mb-6 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg border-2 border-emerald-500 bg-zinc-900">
                  <Play size={16} className="text-emerald-400" />
                </div>
                <div className="h-px w-8 bg-zinc-700" />
                <div className="flex h-10 w-10 items-center justify-center rounded-lg border-2 border-blue-500 bg-zinc-900">
                  <Brain size={16} className="text-blue-400" />
                </div>
                <div className="h-px w-8 bg-zinc-700" />
                <div className="flex h-10 w-10 items-center justify-center rounded-lg border-2 border-red-500 bg-zinc-900">
                  <Square size={16} className="text-red-400" />
                </div>
              </div>
              <h2 className="mb-2 text-lg font-medium">No graphs yet</h2>
              <p className="mb-6 text-sm text-zinc-400">
                Create your first AI workflow
              </p>
              <Button variant="primary" onClick={handleNewGraph}>
                <Plus size={14} className="mr-1" /> New Graph
              </Button>
            </div>
          ) : (
            /* Graph grid */
            <div>
              <h2 className="mb-4 text-sm font-medium text-zinc-400">Your Graphs</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {graphs.map((g) => (
                  <GraphCard
                    key={g.id}
                    name={g.name}
                    nodeCount={g.nodes.length}
                    updatedAt={g.metadata.updated_at}
                    onClick={() => handleSelectGraph(g.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </main>

        <NewGraphDialog />
      </div>
    );
  }
  ```

  UX details:
  - Responsive grid: 1 column on mobile, 2 on sm, 3 on md, 4 on lg
  - Empty state has a visual mini-graph illustration (Start→LLM→End)
  - Loading state shows centered spinner text
  - "New Graph" button in both header and empty state CTA
  - API errors silently show empty list (acceptable for C1)

### 8. Create CanvasHeader

- [ ] Create `packages/canvas/src/components/canvas/CanvasHeader.tsx`:

  Replaces the old Header. Adds a back button and editable graph name.

  ```typescript
  import { memo, useCallback, useRef, useState, type KeyboardEvent } from "react";
  import { ChevronLeft, Pencil, Save } from "lucide-react";
  import { useGraphStore } from "@store/graphSlice";
  import { useUIStore } from "@store/uiSlice";
  import { Button } from "@ui/Button";

  function CanvasHeaderComponent() {
    const graph = useGraphStore((s) => s.graph);
    const dirty = useGraphStore((s) => s.dirty);
    const saving = useGraphStore((s) => s.saving);
    const saveError = useGraphStore((s) => s.saveError);
    const saveGraph = useGraphStore((s) => s.saveGraph);
    const renameGraph = useGraphStore((s) => s.renameGraph);
    const setView = useUIStore((s) => s.setView);

    const [editing, setEditing] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const handleBack = useCallback(() => {
      if (dirty && !window.confirm("You have unsaved changes. Leave anyway?")) {
        return;
      }
      setView("home");
    }, [dirty, setView]);

    const handleNameClick = useCallback(() => {
      setEditing(true);
      // Focus the input after state update
      setTimeout(() => inputRef.current?.select(), 0);
    }, []);

    const handleNameBlur = useCallback(() => {
      setEditing(false);
    }, []);

    const handleNameChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        renameGraph(e.target.value);
      },
      [renameGraph],
    );

    const handleNameKeyDown = useCallback(
      (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter" || e.key === "Escape") {
          setEditing(false);
          inputRef.current?.blur();
        }
      },
      [],
    );

    return (
      <header className="flex h-12 items-center justify-between border-b border-zinc-800 px-4">
        <div className="flex items-center gap-3">
          <button
            onClick={handleBack}
            className="flex items-center gap-1 text-sm text-zinc-400 hover:text-zinc-100"
            aria-label="Back to home"
          >
            <ChevronLeft size={16} />
            <span>GraphWeave</span>
          </button>

          {graph && (
            <div className="flex items-center gap-1 border-l border-zinc-700 pl-3">
              {editing ? (
                <input
                  ref={inputRef}
                  value={graph.name}
                  onChange={handleNameChange}
                  onBlur={handleNameBlur}
                  onKeyDown={handleNameKeyDown}
                  className="w-40 border-b border-blue-500 bg-transparent text-sm text-zinc-100 outline-none"
                  aria-label="Graph name"
                />
              ) : (
                <button
                  onClick={handleNameClick}
                  className="group flex items-center gap-1 text-sm text-zinc-300 hover:text-zinc-100"
                  title="Click to rename"
                >
                  <span>{graph.name}</span>
                  <Pencil size={12} className="text-zinc-600 opacity-0 transition-opacity group-hover:opacity-100" />
                </button>
              )}
              {dirty && (
                <span className="text-amber-400" title="Unsaved changes">*</span>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            onClick={saveGraph}
            disabled={!graph || !dirty || saving}
          >
            <Save size={14} className="mr-1" />
            {saving ? "Saving..." : "Save"}
          </Button>
          {saveError && (
            <span className="text-xs text-red-400" role="alert">{saveError}</span>
          )}
        </div>
      </header>
    );
  }

  export const CanvasHeader = memo(CanvasHeaderComponent);
  ```

  UX details:
  - "◀ GraphWeave" acts as both branding and back button
  - Click the graph name to enter inline edit mode
  - Edit pencil icon (✎) appears on hover for discoverability
  - Enter or Escape exits edit mode
  - Dirty indicator (*) next to the name
  - Confirm dialog before leaving with unsaved changes
  - Save button disabled when not dirty or currently saving

### 9. Rewrite App.tsx (final C1 version)

- [ ] Rewrite `packages/canvas/src/App.tsx`:

  ```typescript
  import { ReactFlowProvider } from "@xyflow/react";
  import "@xyflow/react/dist/style.css";
  import { CanvasProvider } from "@contexts/CanvasContext";
  import { useUIStore } from "@store/uiSlice";
  import { GraphCanvas } from "./components/canvas/GraphCanvas";
  import { CanvasHeader } from "./components/canvas/CanvasHeader";
  import { NodeConfigPanel } from "./components/panels/NodeConfigPanel";
  import { HomeView } from "./components/home/HomeView";
  import { useBeforeUnload } from "./hooks/useBeforeUnload";

  function CanvasView() {
    useBeforeUnload();

    return (
      <ReactFlowProvider>
        <CanvasProvider>
          <div className="h-screen w-screen bg-zinc-950 text-zinc-100">
            <CanvasHeader />
            <main className="relative h-[calc(100vh-3rem)]">
              <GraphCanvas />
              <NodeConfigPanel />
            </main>
          </div>
        </CanvasProvider>
      </ReactFlowProvider>
    );
  }

  export default function App() {
    const currentView = useUIStore((s) => s.currentView);

    return currentView === "home" ? <HomeView /> : <CanvasView />;
  }
  ```

  Note: `ReactFlowProvider` and `CanvasProvider` only wrap `CanvasView` --
  they are not needed on the home screen. This means they mount/unmount
  when switching views, which is correct (canvas state resets between views,
  graph data persists in Zustand).

### 10. Write tests

- [ ] Create `packages/canvas/src/store/__tests__/uiSlice.test.ts`:
  - Test: initial currentView is "home"
  - Test: setView changes currentView
  - Test: initial newGraphDialogOpen is false
  - Test: setNewGraphDialogOpen toggles dialog state

- [ ] Create `packages/canvas/src/store/__tests__/graphSlice.saveLoad.test.ts`:

  Mock the API module:
  ```typescript
  vi.mock("@api/graphs", () => ({
    createGraph: vi.fn(),
    getGraph: vi.fn(),
    listGraphs: vi.fn(),
    updateGraph: vi.fn(),
    deleteGraph: vi.fn(),
  }));
  ```

  - Test: `saveGraph` calls `createGraph` when `persisted` is false
  - Test: `saveGraph` calls `updateGraph` when `persisted` is true
  - Test: `saveGraph` sets `persisted: true` on success
  - Test: `saveGraph` sets `dirty: false` on success
  - Test: `saveGraph` sets `saveError` on failure
  - Test: `saveGraph` sets `saving: true` during save, false after
  - Test: successful save after error clears `saveError` to null
  - Test: `loadGraph` loads graph from API and sets store state
  - Test: `loadGraph` sets `dirty: false` and `persisted: true`
  - Test: `loadGraph` sets `saveError` on failure

- [ ] Create `packages/canvas/src/components/home/__tests__/GraphCard.test.tsx`:
  - Test: renders graph name
  - Test: renders node count
  - Test: renders relative time (e.g., "2h ago")
  - Test: calls onClick when clicked
  - Test: renders mini preview dots

- [ ] Create `packages/canvas/src/components/home/__tests__/NewGraphDialog.test.tsx`:

  Mock `useUIStore` and `useGraphStore`:

  - Test: renders name input when open
  - Test: clicking "Create Graph" calls newGraph with the entered name
  - Test: empty name defaults to "Untitled Graph"
  - Test: Enter key submits
  - Test: clicking Cancel closes dialog
  - Test: Escape key closes dialog

- [ ] Create `packages/canvas/src/components/home/__tests__/HomeView.test.tsx`:

  Mock `useGraphStore` and `useUIStore`:

  - Test: shows loading state initially
  - Test: shows empty state when no graphs exist
  - Test: renders graph cards for each graph
  - Test: clicking a graph card calls loadGraph and sets view to "canvas"
  - Test: clicking "New Graph" opens the NewGraphDialog

- [ ] Create `packages/canvas/src/__tests__/App.test.tsx`:

  Mock `useUIStore`:

  - Test: renders HomeView when currentView is "home"
  - Test: renders CanvasView when currentView is "canvas"

- [ ] Create `packages/canvas/src/components/canvas/__tests__/CanvasHeader.test.tsx`:

  Mock `useGraphStore` and `useUIStore`:

  - Test: renders "GraphWeave" back button
  - Test: shows graph name when graph is loaded
  - Test: clicking name enables inline edit mode
  - Test: typing in edit mode calls renameGraph
  - Test: Enter key exits edit mode
  - Test: shows dirty indicator (*) when dirty
  - Test: Save button disabled when not dirty
  - Test: clicking Save calls saveGraph
  - Test: shows "Saving..." when saving
  - Test: shows error message when saveError is set
  - Test: clicking back with dirty state shows confirm dialog

### 11. Verify

- [ ] Run `pnpm --filter @graphweave/canvas typecheck`
- [ ] Run `pnpm --filter @graphweave/canvas lint`
- [ ] Run `pnpm --filter @graphweave/canvas test`
- [ ] Run `pnpm --filter @graphweave/canvas dev` -- visually verify:
  - App opens to home screen (empty state with illustration)
  - Click "New Graph" -- dialog opens, type a name, click Create
  - Canvas opens with Start→End pre-placed and connected
  - Canvas hint shows "Drag nodes from the toolbar..."
  - Drag an LLM node -- hint disappears (> 2 nodes)
  - Click graph name in header -- inline edit mode activates
  - Type a new name, press Enter -- name updates, dirty indicator appears
  - Click Save -- "Saving..." appears (fails without backend, that's OK)
  - Click "◀ GraphWeave" -- confirm dialog if dirty, then back to home

---

## What Could Go Wrong

| Risk | Detection | Rollback |
|------|-----------|----------|
| API calls fail without backend running | Save/load errors in console | Expected for frontend-only dev. saveError shows in UI. Home view shows empty list. |
| `<dialog>` showModal not supported in jsdom | Dialog tests fail | Mock `HTMLDialogElement.prototype.showModal` in test setup |
| `window.confirm` blocks in tests | Test hangs | Mock `window.confirm`: `vi.spyOn(window, "confirm").mockReturnValue(true)` |
| `beforeunload` event not cancelable in all browsers | User navigates away without warning | Modern browsers support it. Acceptable for C1. |
| View routing loses React Flow state on switch | Canvas resets when going home and back | Expected -- graph data persists in Zustand, RF visual state (viewport, selection) resets. Acceptable for C1. |
| `formatTimeAgo` shows wrong relative time | Visual check in dev server | Simple implementation covers common cases. Edge cases (timezone, DST) acceptable for C1. |
| Graph list doesn't update after save | Stale list on home screen | List re-fetches on mount (useEffect). Going home→canvas→home refetches. |
| Inline name edit doesn't auto-focus | User has to click twice | `setTimeout(() => inputRef.current?.select(), 0)` handles the timing |

---

## Implementation Deviation: React Router v7 replaces state-driven navigation

**Date:** 2026-03-16

The `currentView`/`setView` pattern in `uiSlice` was replaced with React Router v7 (library mode). Routes: `/` → HomeView, `/graph/:id` → CanvasRoute, `*` → redirect to `/`. The `AppView` type, `currentView` state, and `setView` action were removed from `uiSlice`. Navigation call sites now use `useNavigate()` and `useParams()` from react-router. A new `CanvasRoute` component handles URL-param graph loading with loading/error states. This was originally deferred to C6 (overview decision #9) but pulled forward for shareable URLs, browser back/forward, and nested route readiness.
