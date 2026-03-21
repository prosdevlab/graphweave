# Canvas Phase 5 -- Run History, Debug Panel, Error UX

**Status: Planning**

## Goal

After this phase, users can:

1. Navigate panels via a VS Code-style activity bar + side/bottom panel layout
2. Browse past runs for the current graph, filter by status, inspect or delete them
3. Click any node during or after a run to see its state snapshot (what changed)
4. Validate a graph before running it, with actionable error messages
5. View and export the current GraphSchema as JSON

## Architecture: VS Code-style panel layout

Replace the three independent Sheet overlays with a VS Code-inspired layout:
activity bar (left) + side panel (right) + bottom panel (editor-scoped).

Reference: [VS Code workbench layout](https://code.visualstudio.com/docs/getstarted/userinterface).
Same pattern used by Cursor, Windsurf, and other developer tools.

Two separate toolbar concerns:
- **Activity bar** (left edge): WHAT to show — swaps side panel content
- **Panel control toolbar** (top-right, floating): WHETHER to show — toggles panel visibility

```
 CanvasRoute
 +-------------------------------------------------------------------------+
 | CanvasHeader (h-12)                              [Save] [Run/Stop]      |
 +-------------------------------------------------------------------------+
 | main (flex-row, h-[calc(100vh-3rem)])                                   |
 |                                                                         |
 | +--ActBar--+--EditorArea (flex-col, flex-1)--+--<>--+--SidePanel-----+  |
 | |          |                                 |resize|                |  |
 | | [config] |  GraphCanvas (flex-1)    [<|][_v][|>]  | <active panel> |  |
 | | [state]  |    ReactFlow             PanelCtrl     |                |  |
 | | [history]|    FloatingToolbar (z-10) (top-right)   | Full height    |  |
 | | [schema] |                                 |      | Node config    |  |
 | |          |---- resize handle (horiz) ------|      | or State       |  |
 | |          |  BottomPanel (collapsible)      |      | or History     |  |
 | |          |  [Timeline] [Debug] tabs        |      | or Schema      |  |
 | |          |  events | state inspector       |      | or Chat (v2)   |  |
 | +----------+---------------------------------+------+----------------+  |
 |      ^                   ^            ^                 ^               |
 |      |                   |            |                 |               |
 |  activity bar    bottom panel    panel ctrl       side panel            |
 |  full height     editor-scoped   floating         full height           |
 |  WHAT to show                    WHETHER to show                        |
 +-------------------------------------------------------------------------+

 Layout mirrors VS Code:
   VS Code:    Activity Bar | Editor + Terminal | Sidebar
   GraphWeave: Activity Bar | Canvas + RunPanel | Config/State/History
```
```

### Panel control toolbar (top-right of canvas, floating)

```
  +-------+-------+-------+
  | [PanL] | [PanB] | [PanR] |
  +-------+-------+-------+
     ^        ^        ^
     |        |        |
   Left     Bottom    Right
   panel    panel     panel
   toggle   toggle    toggle

  Icons (lucide):
    PanelLeft       — toggle left panel (no-op for now, wired for future)
    PanelBottom     — toggle bottom panel open/closed
    PanelRight      — toggle side panel open/closed

  Styling:
    position: absolute top-3 right-3 z-10 (inside canvas, above ReactFlow)
    bg-zinc-900/80 backdrop-blur-sm rounded-md border border-zinc-800
    h-8, ~110px wide
    icons: 16px, zinc-500 inactive, zinc-100 active (panel open)
    gap-0.5 between icons, p-1

  Behavior:
    PanelRight toggles side panel visibility (activity bar stays visible)
    PanelBottom toggles bottom panel visibility
    PanelLeft reserved for future left panel (disabled/dim for now)
    When side panel closes, activity bar selection preserved
    When side panel opens, it shows whatever was last active
```

### Activity bar detail (left edge, like VS Code)

```
+--ActivityBar--+
|               |
|  [settings]   |  <- Node config (when node selected)
|  [database]   |  <- State fields
|  [history]    |  <- Run history
|  [braces]     |  <- Schema viewer
|               |
|               |
|               |
|  (bottom:)    |
|  [terminal]   |  <- Toggle bottom panel
|               |
+---------------+
  w-10 (40px)
  border-r border-zinc-800
  bg-zinc-950
  icons: 18px, zinc-500, hover: zinc-300
  active: zinc-100 + left-2px indigo border

  Compare VS Code:
  +----+                    +----+
  | [] | Explorer           | >> | Node Config
  | Q  | Search             | DB | State Fields
  | Y  | Source Control     | CL | Run History
  | [] | Run & Debug        | {} | Schema
  | [] | Extensions         |    |
  |    |                    | >_ | Bottom Panel
  +----+                    +----+
  VS Code                   GraphWeave
```

### Side panel swapping (right edge, full height)

```
Activity bar (left) click -> toggles side panel (right) content:

  [Node Config] active:
  +--SidePanel (w-80)----------+
  | NODE CONFIG                |
  | Label: [Search        ]    |
  | Tool:  [web_search    v]   |
  | Parameters ...             |
  | Output key: [search_result]|
  +----------------------------+

  [State] active:
  +--SidePanel (w-80)----------+
  | STATE FIELDS               |
  | messages  list   append    |
  | user_input string replace  |
  | + Add field                |
  +----------------------------+

  [History] active:               <-- NEW in Phase 5
  +--SidePanel (w-80)----------+
  | RUN HISTORY                |
  | [All] [OK] [Err] [Paused] |
  |                            |
  | V #abc123  2m14s  Mar 20   |
  | X #def456  0.8s   Mar 20   |
  |   InputMapError: ...       |
  | V #ghi789  5.1s   Mar 19   |
  |                            |
  | [Load more] (3 of 12)     |
  +----------------------------+

  [Schema] active:                <-- NEW in Phase 5
  +--SidePanel (w-80)----------+
  | SCHEMA                     |
  | {                          |
  |   "name": "My Agent",     |
  |   "state": [...],         |
  |   "nodes": [...],         |
  |   ...                     |
  | }                          |
  | [V Valid]  [Copy] [Save]   |
  +----------------------------+

  Clicking active icon again -> hides side panel (sidePanelVisible = false)
    Selection preserved — PanelRight toggle or next icon click restores it
  Node click on canvas -> auto-activates Node Config panel + sidePanelVisible = true
```

### Bottom panel detail (nested inside EditorArea, not full width)

```
+---BottomPanel (inside EditorArea, does NOT extend under side panel)-+
|                                                                     |
| [Timeline] [Debug]  tabs                      Run #abc  2m14s [_][x]|
| --------------------------------------------------------------------+
|                                |                                    |
|  TIMELINE (left 60%)           |  STATE INSPECTOR (right 40%)       |
|                                |  +-- Node: "Search" ----------+    |
|  > Run started  14:02:01       |  |                            |    |
|  V Search       1.2s   openai  |  |  Output:                   |    |
|    -> LLM                      |  |  { results: [...], cnt: 3 }|    |
|  * LLM          <- selected    |  |                            |    |
|                                |  |  State after this node:    |    |
|                                |  |  > messages (list)    [=]  |    |
|                                |  |  v search_result      [NEW]|    |
|                                |  |    results: [...]          |    |
|                                |  |    count: 3                |    |
|                                |  |  > user_input (str)   [=]  |    |
|                                |  |                            |    |
|                                |  |  [=] unchanged [NEW] added |    |
|                                |  |  [~] modified  [-] removed |    |
|                                |  +----------------------------+    |
+--------------------------------+------------------------------------+

  [_] = minimize (collapse to tab bar only, ~32px)
  [x] = close bottom panel entirely
  Activity bar [terminal] icon toggles bottom panel
  Bottom panel auto-opens on run start (existing behavior preserved)
```

### Validation error dialog

```
Hard errors (Run anyway disabled):

+--- Validation Errors --------------------------------+
|                                                      |
|  2 errors must be fixed before running:              |
|                                                      |
|  [X] Tool node "Search" has unmapped required param  |
|      query -> (empty)                                |
|      [Go to node]                                    |
|                                                      |
|  [X] LLM node "Summarizer" missing provider          |
|      provider is not set                             |
|      [Go to node]                                    |
|                                                      |
|                                      [Fix issues]    |
+------------------------------------------------------+

Warnings only (Run anyway enabled):

+--- Validation Warnings ------------------------------+
|                                                      |
|  1 warning:                                          |
|                                                      |
|  [!] LLM node "Summarizer" has no system prompt      |
|      Will use empty string                           |
|      [Go to node]                                    |
|                                                      |
|                        [Run anyway]   [Fix issues]   |
+------------------------------------------------------+
```

### Data flow: Activity bar (left) + side panel (right)

```
CanvasContext manages:
  activeSidePanel: "config" | "state" | "history" | "schema" | null  -- WHAT (activity bar)
  sidePanelVisible: boolean          -- WHETHER (panel control toolbar)
  bottomPanelVisible: boolean        -- WHETHER (panel control toolbar)
  bottomPanelMinimized: boolean      -- collapse to tab bar only

ActivityBar (left, full height) reads activeSidePanel, renders icon highlights
SidePanel (right, full height) reads activeSidePanel, renders matching content

  Click activity icon:
    same as active -> toggle sidePanelVisible (preserves selection)
    different      -> set new panel + sidePanelVisible = true

  Node click on canvas:
    setSelectedNodeId(id)
    setActiveSidePanel("config")  -- auto-open config

  Node deselect (click canvas bg):
    setSelectedNodeId(null)
    -- side panel stays on whatever was active (don't force-close)
```

### Data flow: Run History

```
User clicks History icon in activity bar
  |
  v
SidePanel renders RunHistoryPanel
  |
  v
useEffect -> historySlice.loadRuns(graphId)
  |
  v
GET /graphs/{graph_id}/runs?status=X&limit=20&offset=0
  |                                          (new API client fn)
  v
historySlice stores: { runs[], total, loading, error, statusFilter }
  |
  v
RunHistoryPanel reads historySlice
  - run rows: status icon, created_at, duration, error preview
  - status filter chips: All / Completed / Error / Paused
  - click row -> opens bottom panel, loads run summary
  - delete button -> DELETE /runs/{run_id}
  - auto-refreshes when runSlice.runStatus reaches terminal state
```

### Data flow: Debug Panel (State Inspector)

```
During live run:
  node_completed SSE events carry state_snapshot
  _handleEvent already appends these to runOutput[]
  |
  v
User clicks a node on canvas (or in timeline)
  |
  v
runSlice.inspectNode(nodeId)
  reads runOutput[] for the node_completed event matching nodeId
  extracts: state_snapshot, output, duration_ms
  |
  v
StateInspector component renders:
  - JSON tree view of state_snapshot
  - diff: compares against previous node's state_snapshot
    (find the node_completed event BEFORE this one in runOutput)
  - changed keys highlighted in green/amber
  - node output shown separately at top

For historical runs:
  DB only stores final_state, NOT per-node snapshots.
  -> Bottom panel header shows: "Run #xyz · Mar 20 · 2m14s [Back to live run]"
  -> Input section at top: shows run's input object
  -> Debug panel shows final_state with message:
     "Per-node snapshots are available for live runs. Showing final graph state."
  -> Clicking a node does nothing (no per-node data to show)
```

### Data flow: Pre-run Validation

```
User clicks "Run" button
  |
  v
saveGraph() (existing)
  |
  v
Client-side validateGraph() (existing, fast pre-check)
  |
  +-- errors found -> show ValidationErrorDialog immediately
  |                   (uses nodeId field from client validator)
  |
  +-- no errors -> continue to server validation
        |
        v
      POST /graphs/{graph_id}/validate     (new API client fn)
        |
        +-- { valid: true }
        |     -> brief green flash "Valid — starting run..."
        |     -> proceed to startRun()
        |
        +-- { valid: false, errors: [...] }
              |
              v
            ValidationErrorDialog
              (normalizes node_ref -> nodeId for consistency)
              - errors classified by severity (error vs warning)
              - click error -> select node, open config panel
              - "Fix issues" -> close dialog
              - "Run anyway" -> ONLY enabled if all findings are warnings
              - hard errors: "2 errors must be fixed before running"
```

## UX principles: transparency builds trust

Every interaction should answer: "What just happened? What's happening now? What should I do next?"

### Run lifecycle feedback (no silent gaps)

```
User clicks "Run"
  |
  v
Bottom panel opens with status line:
  "Saving..."        (during saveGraph)
  "Validating..."    (during client + server validate)
  "V Valid — starting run..."  (brief green flash, then SSE connects)
  "Run started"      (first SSE event — existing)

If validation fails:
  "2 errors found"   (red, opens ValidationErrorDialog)
```

### Validation error severity

```
Errors classified as:

  ERROR (hard) — will crash at runtime, must fix
    - unmapped required param
    - missing provider/model
    - tool not found
    - invalid graph topology
    -> "Run anyway" button DISABLED or HIDDEN

  WARNING (soft) — may work, user decides
    - empty system prompt
    - optional param unmapped
    - output_key shadows another node
    -> "Run anyway" button ENABLED

  Dialog shows: "2 errors must be fixed" vs "1 warning — you can run anyway"
```

### Mode-aware node clicks

```
When runStatus === "idle" (editing mode):
  Click node -> open side panel with config (existing behavior)

When runStatus !== "idle" (debugging mode):
  Click node -> update bottom panel StateInspector only
  Side panel stays on whatever was active (don't jump to config)
  User can still manually switch to config via activity bar
```

### Historical run visibility

```
Bottom panel header when viewing runs:

  Live run:
  +-- Run #abc123 (live) ● ----------------------------- 2m 14s --+

  Historical run:
  +-- Run #def456 · Mar 20 14:02 · 2m 14s --- [Back to live run] -+

  Historical runs also show:
  - Input section at top: "Input: { user_input: 'search for cats' }"
  - Final state (not per-node): "Per-node snapshots are available
    for live runs. Showing final graph state."
```

### Empty states (always show something, never blank)

```
History panel (no runs):     "No runs yet. Click Run to execute your graph."
StateInspector (no node):    "Click a node in the timeline to inspect its state."
Schema panel (no graph):     (should not happen — graph always exists on canvas)
Bottom panel (no run):       "Run your graph to see execution events here."
```

### Activity bar tooltips (required on all icons)

```
[>>]  "Node Config"       Cmd+1
[DB]  "State Fields"      Cmd+2
[CL]  "Run History"       Cmd+3
[{}]  "Schema"            Cmd+4
[>_]  "Toggle Terminal"   Cmd+J
```

### Delete confirmation for runs

```
Click delete on history row ->
  Confirmation: "Delete run #abc123? This cannot be undone."
  [Cancel] [Delete]
```

## Scope decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Panel layout | VS Code-style activity bar + side panel + bottom panel | Familiar interaction pattern, scales to more panels, cleaner than stacked sheets |
| Activity bar position | Left edge (like VS Code) | Familiar placement. FloatingToolbar is a canvas overlay at z-10, doesn't conflict. |
| Side panel content | Single panel, swaps content via activity bar | Avoids multiple overlapping panels competing for space |
| Bottom panel | Run timeline + debug inspector (split) | Terminal-like area for execution output, separate from config/browsing |
| Run history location | Side panel (activity bar icon), not bottom tab | History is a browsing activity, not part of the live run timeline |
| Schema viewer location | Side panel (activity bar icon) | Consistent with other panels; no need for a separate dialog |
| Per-node snapshots for historical runs | Not supported | DB stores only final_state. Event log table is out of scope. |
| History pagination | Client-side load-more (not infinite scroll) | Simple, explicit. 20 runs per page matches API default. |
| State diff algorithm | Shallow key comparison | State is typically flat. Deep diff adds library dep. |
| Pre-run validation | Client-side first (fast), then server-side (deep) | Client catches obvious errors instantly; server catches build-time errors. Normalize error shapes. |
| Validation severity | Classify errors vs warnings; gate "Run anyway" on severity | Hard errors will always crash — don't let users waste API credits. Warnings are user's choice. |
| Run lifecycle feedback | Status line in bottom panel: Saving → Validating → Starting | Bridges the gap between Run click and first SSE event. No silent waits. |
| Mode-aware node clicks | During runs, node click updates inspector only (not config) | Prevents jarring panel swap when user is debugging, not editing. |
| Historical run context | Show input + "Back to live run" breadcrumb | Users need to see what input produced which output. Visual distinction prevents confusion. |
| Empty states | Always show guidance text, never a blank panel | Reduces confusion, guides discovery for new users. |
| Activity bar tooltips | All icons have tooltips with keyboard shortcuts | Discoverability for new users; efficiency for power users. |
| Delete confirmation | Confirm before deleting runs (irreversible server-side) | Prevent accidental data loss. Consistent with StatePanel's undo pattern. |
| 422 handling for validate | New `requestRaw()` in client.ts | Current `request()` throws on non-2xx. Need to parse 422 body for validation errors. |
| History auto-refresh | Invalidate on terminal run status | User sees latest run when switching to History panel after a run completes. |

## Parts

| Part | Summary | Dependencies | Est. files |
|------|---------|-------------|------------|
| 5.1 | [Layout refactor -- activity bar, panel toolbar, resizable panels](phase-5.1-layout-refactor.md) | None | 12 src + 6 test |
| 5.2 | [Run History -- API client + store + list UI](phase-5.2-run-history.md) | 5.1 (side panel slot) | 4 src + 3 test |
| 5.3 | [Debug Panel -- State Inspector](phase-5.3-debug-panel.md) | 5.1 (bottom panel split) | 4 src + 3 test |
| 5.4 | [Error UX -- Pre-run validation](phase-5.4-error-ux.md) | None (parallel with 5.2/5.3) | 4 src + 3 test |
| 5.5 | [Schema Viewer](phase-5.5-schema-viewer.md) | 5.1 (side panel slot) | 2 src + 1 test |

```
Dependency graph:

  5.1 (Layout refactor)
    |
    +---> 5.2 (Run History)   -- needs side panel slot
    +---> 5.3 (Debug Panel)   -- needs bottom panel split
    +---> 5.5 (Schema Viewer) -- needs side panel slot

  5.4 (Error UX) -- independent (dialog overlay, no panel changes)

Recommended order: 5.1 first, then 5.2/5.3/5.4/5.5 in any order
```

### Part 5.1: Layout refactor -- activity bar + side/bottom panel

Replaces three independent Sheet overlays with a flex-based layout with resizable panels.

New files:
- `packages/canvas/src/components/canvas/ActivityBar.tsx` -- icon strip, active state highlighting
- `packages/canvas/src/components/canvas/SidePanel.tsx` -- container that renders active panel content
- `packages/canvas/src/components/canvas/BottomPanel.tsx` -- collapsible run output + debug split
- `packages/canvas/src/components/canvas/PanelControlToolbar.tsx` -- floating top-right panel toggles
- `packages/canvas/src/components/ui/ResizeHandle.tsx` -- drag handle for panel resizing

Changes:
- `CanvasRoute.tsx` -- restructure from stacked absolutes to flex layout
- `CanvasContext.tsx` -- add `activeSidePanel`, `sidePanelVisible`, `bottomPanelVisible`, `bottomPanelMinimized`. Remove `statePanelOpen` / `setStatePanelOpen` (replaced by `activeSidePanel === "state"` + `sidePanelVisible`).
- `NodeConfigPanel.tsx` -- remove Sheet wrapper, render as SidePanel content
- `StatePanel.tsx` -- remove Sheet wrapper, render as SidePanel content. Replace `statePanelOpen` reads with `activeSidePanel === "state"` + `sidePanelVisible`.
- `RunPanel.tsx` -- remove Sheet wrapper, render inside BottomPanel. Remove local `visible` useState and auto-open useEffect. Auto-open migrates to CanvasRoute: a useEffect watches `runStatus` and sets `bottomPanelVisible = true` when run starts.
- `FloatingToolbar.tsx` -- remove state panel toggle button and `statePanelOpen` usage (moved to activity bar)

```
BEFORE (Phase 4):
+-------+----------------------------------+
| Float |     GraphCanvas (absolute)       |
| Tool  |                                  |
| bar   |  +----Sheet right (absolute)--+  |
|       |  | NodeConfig                 |  |
|       |  +----------------------------+  |
|       |                                  |
| +--Sheet left (abs)--+                   |
| | StatePanel         |                   |
| +--------------------+                   |
|                                          |
| +--Sheet bottom (absolute)------------+  |
| | RunPanel                            |  |
| +-------------------------------------+  |
+------------------------------------------+

AFTER (Phase 5.1):
+----+------+--------------------+--+----------+
|Act |Float |                    |<>|Side Panel|
|Bar |Tool  |   GraphCanvas      |  |          |
|    |bar   |   (flex-1)         |  | full     |
| >> |      |                    |  | height   |
| DB |      +===(resize h)=======+  |          |
| CL |      |  BottomPanel       |  |          |
| {} |      |  timeline|inspector|  |          |
|    |      +--------------------+  |          |
| >_ |                              |          |
+----+------------------------------+--+-------+

  Activity bar (left) and side panel (right) both run FULL HEIGHT.
  Bottom panel is INSIDE EditorArea — does NOT extend under side panel.
  FloatingToolbar floats inside canvas area (z-10 overlay, unaffected).

  <> = vertical resize handle (drag to resize side panel width)
  == = horizontal resize handle (drag to resize bottom panel height)

  Side panel: min 240px, max 480px, default 320px
  Bottom panel: min 120px, max 50vh, default 256px
  Sizes persisted to localStorage

  Matches VS Code layout:
    Activity Bar (left, full h) | Editor + Terminal | Sidebar (right, full h)
```
```

```
Resize handle interaction:

  +--GraphCanvas--+-ResizeHandle-+--SidePanel--+--ActivityBar--+
  |               | (vertical)   |             |               |
  |               | cursor:      |             |               |
  |               | col-resize   |             |               |
  |               | w-1          |             |               |
  +---------------+--------------+-------------+---------------+
  +--ResizeHandle (horizontal, cursor: row-resize, h-1)--------+
  +--BottomPanel-----------------------------------------------+
  |                                                            |
  +------------------------------------------------------------+

  ResizeHandle props:
    direction: "horizontal" | "vertical"
    onResize: (delta: number) => void

  Implementation:
    - onMouseDown -> start tracking
    - onMouseMove -> call onResize with delta px
    - onMouseUp -> stop, persist to localStorage
    - Visual: 1px zinc-800 border, hover: 2px indigo-500, cursor change
    - Double-click: reset to default size

  Constraints:
    Side panel:   min 240px, max 480px, default 320px
    Bottom panel: min 120px, max 50vh, default 256px

  Persistence:
    localStorage key: "gw-panel-sizes"
    Value: { sideWidth: number, bottomHeight: number }
    Read on mount, write on resize end (not every frame)
```

Tests:
- `packages/canvas/src/components/canvas/__tests__/ActivityBar.test.tsx`
- `packages/canvas/src/components/canvas/__tests__/SidePanel.test.tsx`
- `packages/canvas/src/components/canvas/__tests__/BottomPanel.test.tsx`
- `packages/canvas/src/components/canvas/__tests__/PanelControlToolbar.test.tsx`
- `packages/canvas/src/components/ui/__tests__/ResizeHandle.test.tsx`
- Updates to `CanvasRoute.test.tsx` (if exists)

### Part 5.2: Run History -- API client + store + list UI

New files:
- `packages/canvas/src/api/runs.ts` -- add `listRunsForGraph()`, `deleteRun()` functions
- `packages/canvas/src/store/historySlice.ts` -- Zustand store for run list, filter, pagination
- `packages/canvas/src/components/panels/RunHistoryPanel.tsx` -- run list, status filter chips, inspect/delete

Changes:
- `SidePanel.tsx` -- register "history" panel content

API types:
```typescript
interface RunListItem {
  id: string;
  graph_id: string;
  status: "running" | "paused" | "completed" | "error";
  input: Record<string, unknown>;
  duration_ms: number | null;
  created_at: string;
  error: string | null;
}

interface ListRunsOpts {
  status?: "completed" | "error" | "paused";
  limit?: number;
  offset?: number;
}
```

Key behavior:
- Status filter chips pass `status` param to API
- Click row -> open bottom panel, load run summary
- Delete button -> `DELETE /runs/{run_id}` (new API fn, NOT existing)
- Auto-refresh when `runSlice.runStatus` reaches terminal state

Tests:
- `packages/canvas/src/store/__tests__/historySlice.test.ts`
- `packages/canvas/src/api/__tests__/runs.test.ts` (additions)
- `packages/canvas/src/components/panels/__tests__/RunHistoryPanel.test.tsx`

### Part 5.3: Debug Panel -- State Inspector

New files:
- `packages/canvas/src/components/panels/StateInspector.tsx` -- tree view + diff highlight
- `packages/canvas/src/components/panels/JsonTree.tsx` -- recursive expandable JSON renderer

Changes:
- `BottomPanel.tsx` -- add right-side split for StateInspector when node inspected
- `runSlice.ts` -- add `inspectedNodeId`, `inspectNode()`, `clearInspection()`

```
JsonTree rendering:

  > messages (list, 3 items)          [=]
  v user_input (string)               [~]
    "hello"  ->  "search for cats"
  v search_result (object)            [NEW]
    > results (list, 5 items)
    count: 5

  [=] unchanged  [~] modified  [NEW] added  [-] removed
```

Key behavior:
- Click node in timeline or on canvas -> show state_snapshot from node_completed event
- Diff: shallow key comparison against previous node's snapshot
- Historical runs: show final_state only (no per-node drill-down)

Tests:
- `packages/canvas/src/components/panels/__tests__/JsonTree.test.tsx`
- `packages/canvas/src/components/panels/__tests__/StateInspector.test.tsx`
- `packages/canvas/src/store/__tests__/runSlice.test.ts` (additions for inspectedNodeId)

### Part 5.4: Error UX -- Pre-run validation

New files:
- `packages/canvas/src/components/dialogs/ValidationErrorDialog.tsx` -- error list, click-to-select-node

Changes:
- `packages/canvas/src/api/client.ts` -- add `requestRaw()` that returns Response for caller to handle
- `packages/canvas/src/api/graphs.ts` -- add `validateGraph()` using `requestRaw()` to handle 422
- `packages/canvas/src/components/canvas/CanvasHeader.tsx` -- validate-before-run flow
- `packages/canvas/src/store/runSlice.ts` -- add `validationErrors` state

API types:
```typescript
interface ValidationError {
  message: string;
  node_ref: string | null;  // backend field name
}

interface ValidateResponse {
  valid: boolean;
  errors: ValidationError[];
}
```

Validation flow:
1. User clicks Run -> save graph
2. Client-side `validateGraph()` (existing utils, fast pre-check)
3. If client errors -> show ValidationErrorDialog (uses `nodeId`)
4. If client passes -> server-side `POST /graphs/{graph_id}/validate`
5. If server errors -> normalize `node_ref` to `nodeId`, show dialog
6. Dialog: "Fix issues" (close, select first error node) or "Run anyway" (proceed)

Tests:
- `packages/canvas/src/api/__tests__/graphs.test.ts` (additions for validateGraph + 422 handling)
- `packages/canvas/src/components/dialogs/__tests__/ValidationErrorDialog.test.tsx`
- `packages/canvas/src/components/canvas/__tests__/CanvasHeader.test.tsx` (updates for validate-before-run)

### Part 5.5: Schema Viewer

New files:
- `packages/canvas/src/components/panels/SchemaPanel.tsx` -- JSON view + copy/download/validate

Changes:
- `SidePanel.tsx` -- register "schema" panel content

Reads `graphSlice.graph` directly. Strips metadata, pretty-prints JSON with manual syntax coloring. Three actions: copy to clipboard, download `.json`, validate (calls same server endpoint, shows inline badge).

Tests:
- `packages/canvas/src/components/panels/__tests__/SchemaPanel.test.tsx`

## Out of scope

- Per-node event log storage in DB (would require new table + migration)
- SSE replay for historical runs (no event log in DB)
- Run comparison (side-by-side diff of two runs)
- Infinite scroll pagination (explicit "Load more" is sufficient)
- Deep JSON diff (shallow key comparison is adequate for state objects)
- Run re-execution ("Run again with same input") -- nice-to-have, defer
- Left panel (no left panel yet, only right side panel + activity bar)
- Dark mode toggle (Phase 6)
- Python export viewer (Phase 6 -- endpoint exists, UI deferred)

## Architecture constraints

- Components read store only -- no fetch(), no API imports (enforced by tsconfig path aliases)
- `@api` layer handles all HTTP calls; new functions go in existing `runs.ts` and `graphs.ts`
- Dialog component exists from Phase 1 -- reuse for ValidationErrorDialog
- State snapshots exist in `runOutput[]` as `node_completed.data.state_snapshot` -- no new SSE events needed
- Validate endpoint returns 422 for invalid graphs -- need `requestRaw()` in client.ts
- List runs and delete run endpoints already exist on backend -- no execution-layer changes
- Client-side `validateGraph()` uses `nodeId`, server uses `node_ref` -- must normalize

## Decisions & risks

| Decision | Risk | Mitigation |
|----------|------|------------|
| Layout refactor as first part | Large diff, touches many files | Extract content from panels (no logic changes), just re-parent into new containers. Existing tests catch regressions. |
| Activity bar on left edge | FloatingToolbar also on left side of canvas | FloatingToolbar is a canvas overlay (z-10, absolute positioned), activity bar is layout chrome — no conflict. |
| Side panel swaps content | Lose scroll position when switching | Minor UX cost; acceptable for v1. Can add scroll restoration later. |
| History in side panel (not bottom) | Different from original plan | Browsing history is a navigation activity, not execution output. Side panel is the right home. |
| `requestRaw()` for 422 handling | Adds complexity to API client | Isolated to one function. Only validateGraph uses it. Clean separation. |
| Shallow diff for state inspector | Misses nested changes | Show full tree with expand; highlight top-level key changes. User can drill in. |
| Pre-run validation adds latency | Extra round-trip before run | Client-side check is instant. Server check ~100ms. Worth it for error prevention. |
| No per-node debug for historical runs | Users may expect it | Clear UI: "Per-node snapshots available for live runs only." |

## API client functions needed

| Function | File | Endpoint | Notes |
|----------|------|----------|-------|
| `requestRaw(method, path, body?)` | `client.ts` | -- | Returns raw Response; caller handles status codes |
| `listRunsForGraph(graphId, opts?)` | `runs.ts` | `GET /graphs/{graph_id}/runs` | `opts: { status?, limit?, offset? }`. Vite proxy rewrites `/api` to `/v1`. |
| `deleteRun(runId)` | `runs.ts` | `DELETE /runs/{run_id}` | Returns void (204). New function. |
| `validateGraph(graphId)` | `graphs.ts` | `POST /graphs/{graph_id}/validate` | Uses `requestRaw()`, handles 422 as success |

All backend endpoints already exist. No execution-layer changes needed.

## Store changes needed

| Store | Change | Part |
|-------|--------|------|
| `CanvasContext` | Add `activeSidePanel`, `sidePanelVisible`, `bottomPanelVisible`, `bottomPanelMinimized` | 5.1 |
| New: `historySlice.ts` | runs[], total, loading, statusFilter, loadRuns(), deleteRun(), setFilter() | 5.2 |
| Extend: `runSlice.ts` | Add `inspectedNodeId`, `inspectNode()`, `clearInspection()` | 5.3 |
| Extend: `runSlice.ts` | Add `validationErrors[]` | 5.4 |
