# Part 4.3 -- State Panel (Left Sidebar)

## Goal

Add a left-sidebar panel showing all graph state fields. Users can view field
types/reducers, add new fields, and remove unused fields. The panel is toggleable
from the FloatingToolbar and visible simultaneously with the right-side NodeConfig.

## Commit message

```
feat(canvas): add state panel as left sidebar

Toggleable left-side Sheet showing all graph state fields with type and
reducer. Add/remove field capabilities with safety warnings when removing
fields referenced by node input_maps or output_keys. Toggle button added
to FloatingToolbar.
```

## Files to modify

| File | Change |
|------|--------|
| `packages/canvas/src/components/panels/StatePanel.tsx` | **New** -- main state panel component with undo toast |
| `packages/canvas/src/components/panels/StateFieldRow.tsx` | **New** -- individual field row with clickable usage links + delete |
| `packages/canvas/src/components/panels/AddFieldForm.tsx` | **New** -- inline form with human-friendly "When updated" labels |
| `packages/canvas/src/components/canvas/CanvasRoute.tsx` | Add StatePanel to layout |
| `packages/canvas/src/components/canvas/FloatingToolbar.tsx` | Add state panel toggle button |
| `packages/canvas/src/contexts/CanvasContext.tsx` | Add `statePanelOpen` / `setStatePanelOpen` |
| `packages/canvas/src/components/panels/config/ToolNodeConfig.tsx` | Add "Manage fields →" link + "__new_field__" dropdown option |
| `packages/canvas/src/components/panels/config/LLMNodeConfig.tsx` | Add "Manage fields →" link + "__new_field__" dropdown option (done in 4.2) |
| `packages/canvas/src/store/graphSlice.ts` | Add readonly guard to `removeStateFields` |
| `packages/canvas/src/components/panels/__tests__/StatePanel.test.tsx` | **New** tests |

## Design

### State Panel layout

```
+-----------------------------------+
| State Fields                   [X]|
+-----------------------------------+
| State fields carry data between   |
| nodes in your graph.              |
|                                   |
| [messages]  list / append    [RO] |
|   Used by: LLM (input)           |
|                                   |
| [user_input]  string / replace    |
|   Used by: Calculator (query) [x] |
|                                   |
| [llm_response]  string / replace  |
|   Written by: LLM             [x] |
|                                   |
| [tool_result]  object / replace   |
|   Written by: Calculator      [x] |
|                                   |
| + Add field                       |
| [key____] [string_v] [replace_v]  |
| [Add]                             |
+-----------------------------------+
```

### Contextual help text

The state panel includes a one-line description below the title:
> "State fields carry data between nodes in your graph."

This is shown always (not just on first visit) since it's short and provides
orientation every time the panel is opened.

### Field row details

Each row shows:
- Field key (bold)
- Type badge + reducer badge
- "RO" badge for readonly fields (like `messages`)
- Usage info: which nodes read (input_map) or write (output_key) this field
  - Node names are **clickable** — clicking selects that node on the canvas
    and opens its config in the right panel. This creates a direct link between
    the state panel and node config without switching views.
  - Implementation: call `useGraphStore.getState().selectNode(nodeId)` on click.
    The `computeFieldUsage` return type adds `nodeId: string` to each entry.
- Delete button (X) -- hidden for readonly fields

### Usage computation

For each state field, scan all nodes to determine:
1. **Writers**: nodes whose `output_key` matches the field key
2. **Readers**: nodes whose `input_map` values reference the field key (via `extractRootKey`)

```typescript
function computeFieldUsage(
  fieldKey: string,
  nodes: NodeSchema[],
): {
  readers: { nodeId: string; nodeLabel: string; paramName: string }[];
  writers: { nodeId: string; nodeLabel: string }[];
} {
  const readers = [];
  const writers = [];
  for (const node of nodes) {
    if (node.type !== "llm" && node.type !== "tool") continue;
    if (node.config.output_key === fieldKey) {
      writers.push({ nodeId: node.id, nodeLabel: node.label });
    }
    // LLM dual-write: execution layer appends to messages even when
    // output_key is a dedicated field (e.g. "llm_response").
    if (
      node.type === "llm" &&
      fieldKey === "messages" &&
      node.config.output_key !== "messages"
    ) {
      writers.push({ nodeId: node.id, nodeLabel: node.label });
    }
    for (const [param, expr] of Object.entries(node.config.input_map)) {
      if (extractRootKey(expr) === fieldKey) {
        readers.push({ nodeId: node.id, nodeLabel: node.label, paramName: param });
      }
    }
  }
  return { readers, writers };
}
```

Note: LLM nodes with `output_key !== "messages"` still write to `messages`
at the execution layer (dual-write for conversation buffer). This is reflected
in the usage display so users don't accidentally delete the `messages` field.

**Performance**: Compute usage for ALL fields at once in a single `useMemo`,
keyed on `[nodes, stateFields]`. Do NOT call `computeFieldUsage` per-field
inside the render loop — that's O(F*N*M) on every store change (including
node drag). Instead, build a `Map<string, Usage>` once per render cycle:

```typescript
const usageMap = useMemo(() => {
  const map = new Map<string, { readers: ..., writers: ... }>();
  for (const field of stateFields) {
    map.set(field.key, computeFieldUsage(field.key, nodes));
  }
  return map;
}, [nodes, stateFields]);
```

### Delete safety — undo toast pattern

When user clicks delete on a field:
- If field has readers or writers: show warning text inline
  ```
  "This field is used by Calculator (query) and LLM (output).
   Removing it will break those mappings."
  ```
  Two buttons: "Remove anyway" (red) and "Cancel"
- If field has no references: remove immediately

**After deletion (regardless of warnings)**: Show an undo toast at the bottom
of the screen for 5 seconds: `"Removed field 'user_input'" [Undo]`. Clicking
"Undo" calls `addStateFields` with the deleted field's full definition (key,
type, reducer). This is the Gmail undo pattern — faster and more forgiving
than a confirmation-only dialog.

Implementation: store the last deleted field in component state. The toast is
a simple absolute-positioned div, not a toast library.

**Visual feedback on affected nodes**: When a field is deleted, any node whose
input_map or output_key references it will show a validation error on the next
`validateGraph` call (triggered by save or Run). To surface this immediately,
add a `staleFields` check to node presenters: if a node references a state
field key that doesn't exist, show a small amber warning badge on the canvas
node. This reuses the existing `validateGraph` infrastructure — the badge
appears based on reactive store reads, no polling needed.

### Add field form

Inline form (not a dialog) at bottom of panel:
- Key: text input (alphanumeric + underscore, no spaces)
- Type: Select dropdown (string, list, object, number, boolean)
- "When updated" (reducer): Select dropdown with human-friendly labels:
  - "Replace (keep latest)" → `replace`
  - "Append (add to list)" → `append`
  - "Merge (combine objects)" → `merge`
  - Default selection: "Replace (keep latest)"
- Add button

The UI labels "When updated" instead of "Reducer" since most users won't know
the LangGraph term. The underlying schema value remains `reducer: "replace"` etc.

Similarly, field row badges show human-friendly labels: `replace` → "replace",
`append` → "append", `merge` → "merge" (these are clear enough as badges; the
expanded explanations only appear in the AddFieldForm dropdown).

Validation:
- Key must not be empty
- Key must not duplicate an existing field
- Key must match `/^[a-z][a-z0-9_]*$/` (lowercase snake_case)

### Discoverability (3 entry points)

The state panel must be discoverable from multiple places, not just a toolbar icon.

**Entry point 1: FloatingToolbar button**

Add a "State" button to the FloatingToolbar, below the node type buttons.
Use `Database` icon from lucide-react.

```
FloatingToolbar (expanded):
  [X] Close
  [->] Pointer
  --- node types ---
  [S] Start
  [L] LLM
  [T] Tool
  [C] Condition
  [H] Human Input
  [E] End
  --- separator ---
  [D] State        <-- NEW (Database icon)
```

When clicked, toggles `statePanelOpen` in CanvasContext.

**Entry point 2: "Manage fields" link in node config panels**

In both LLMNodeConfig and ToolNodeConfig, add a small link below the
"Input Mappings" header that opens the state panel:

```tsx
<button
  type="button"
  onClick={() => setStatePanelOpen(true)}
  className="text-[10px] text-zinc-500 hover:text-zinc-300"
>
  Manage fields →
</button>
```

This creates a direct path from the place where users encounter state fields
to the place where they manage them. Requires CanvasContext access in config
components (already available via React context tree).

**Entry point 3: "+ New field" option in source dropdown**

In the input_map source dropdown (both LLM and Tool configs), add an option
at the bottom:

```tsx
<option value="__new_field__">+ New field...</option>
```

When selected, open the state panel (auto-scrolled to the AddFieldForm).
This handles the "I need a field that doesn't exist yet" workflow without
forcing the user to leave the node config, find the state panel, open it,
add the field, then come back.

### CanvasContext addition

```typescript
// Add to CanvasContext
statePanelOpen: boolean;
setStatePanelOpen: (open: boolean) => void;
```

### CanvasRoute layout change

```tsx
// BEFORE
<main className="relative h-[calc(100vh-3rem)]">
  <GraphCanvas />
  <NodeConfigPanel />
  <RunPanel />
</main>

// AFTER
<main className="relative h-[calc(100vh-3rem)]">
  <GraphCanvas />
  <StatePanel />      {/* NEW -- left side */}
  <NodeConfigPanel /> {/* right side */}
  <RunPanel />        {/* bottom */}
</main>
```

### Guard: removeStateFields must respect readonly flag

The `removeStateFields` action in graphSlice currently filters by key without
checking `readonly`. This is a data integrity risk — if any code path calls
`removeStateFields(["messages"])`, the messages field is silently removed,
breaking the LLM dual-write contract.

**Fix in graphSlice.ts**:
```typescript
// In removeStateFields, filter out readonly fields before removing:
removeStateFields: (keys) => {
  const remove = new Set(keys);
  set((s) => ({
    graph: s.graph ? {
      ...s.graph,
      state: s.graph.state.filter(
        (f) => !remove.has(f.key) || f.readonly,
      ),
    } : s.graph,
  }));
},
```

This is defense-in-depth — the UI already hides the delete button for readonly
fields, but the store-level guard prevents programmatic deletion.

**Test**: `graphSlice.test.ts`: "removeStateFields ignores readonly fields"

### Edge case: state panel open + node deleted

When a node is deleted, state fields that were only referenced by that node
may become "orphaned". The state panel should update reactively (it reads from
the store). No special handling needed -- the usage computation will simply
show no readers/writers for those fields.

### Edge case: add field while node config is open

If user adds a field in the state panel, it immediately appears in the
`getRelevantFields` dropdown in the node config panel (right side). This works
because both read from `useGraphStore((s) => s.graph?.state)`.

## Required tests

| Test | File | What it verifies |
|------|------|-----------------|
| Renders all fields | StatePanel.test.tsx | Shows each state field key, type, reducer |
| Shows readonly badge | StatePanel.test.tsx | `messages` field shows RO indicator |
| Add field | StatePanel.test.tsx | Fill form, click Add, calls addStateFields |
| Add field validation | StatePanel.test.tsx | Empty key or duplicate key shows error |
| Delete unused field | StatePanel.test.tsx | Click delete, field removed (no warning) |
| Delete used field shows warning | StatePanel.test.tsx | Field with references shows warning |
| Delete used field confirm | StatePanel.test.tsx | Click "Remove anyway" calls removeStateFields |
| Usage display | StatePanel.test.tsx | Shows reader/writer node labels |
| LLM dual-write usage | StatePanel.test.tsx | LLM with output_key "llm_response" shows as writer of both llm_response AND messages |
| Clickable usage links | StatePanel.test.tsx | Clicking a node name in usage calls selectNode with correct nodeId |
| Undo toast on delete | StatePanel.test.tsx | After deleting a field, undo toast appears; clicking Undo restores the field |
| Empty state message | StatePanel.test.tsx | Panel with zero state fields shows help text and AddFieldForm |
| removeStateFields readonly guard | graphSlice.test.ts | Calling removeStateFields with a readonly key does not remove it |

## Verification steps

1. `pnpm tsc --noEmit` -- no type errors
2. `pnpm test` -- all tests pass
3. Manual: open state panel via toolbar, verify fields shown
4. Manual: add a new field, verify it appears in LLM/Tool config dropdowns
5. Manual: delete a field referenced by a node, verify warning shown
6. Manual: state panel + node config open simultaneously

## Detailed todolist

### CanvasContext

- [ ] Open `packages/canvas/src/contexts/CanvasContext.tsx`
  - [ ] Add `statePanelOpen: boolean` to context type (default `false`)
  - [ ] Add `setStatePanelOpen: (open: boolean) => void` to context type
  - [ ] Add state and setter in CanvasProvider

### FloatingToolbar

- [ ] Open `packages/canvas/src/components/canvas/FloatingToolbar.tsx`
  - [ ] Import `Database` from lucide-react
  - [ ] Import `useCanvasContext` (already imported)
  - [ ] Destructure `statePanelOpen, setStatePanelOpen` from context
  - [ ] Add separator + State button after node type buttons (in expanded view):
    ```tsx
    <div className="mx-1.5 border-t border-zinc-800" />
    <Tooltip content="State fields" side="right">
      <button
        type="button"
        onClick={() => setStatePanelOpen(!statePanelOpen)}
        className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
          statePanelOpen
            ? "bg-zinc-700/50 text-zinc-100"
            : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
        }`}
        aria-label="State fields"
        aria-pressed={statePanelOpen}
      >
        <Database size={16} />
      </button>
    </Tooltip>
    ```
  - [ ] In collapsed view, add the same button below the CircuitBoard button

### StatePanel component

- [ ] Create `packages/canvas/src/components/panels/StatePanel.tsx`
  - [ ] Import: Sheet from `@ui/Sheet`, useCanvasContext, useGraphStore
  - [ ] Read `statePanelOpen, setStatePanelOpen` from CanvasContext
  - [ ] Read `graph?.state`, `nodes` from graphSlice
  - [ ] Render Sheet with `side="left"` and `title="State Fields"`
  - [ ] Map over `graph.state` fields, render StateFieldRow for each
  - [ ] Render AddFieldForm at bottom
  - [ ] Export as named export

### StateFieldRow component

- [ ] Create `packages/canvas/src/components/panels/StateFieldRow.tsx`
  - [ ] Props: `field: StateField`, `usage: { readers, writers }`, `onDelete: () => void`
  - [ ] Render:
    - Field key in medium weight
    - Type badge (e.g. `string`) -- small, muted
    - Reducer badge (e.g. `replace`) -- small, muted
    - `[RO]` badge if `field.readonly`
    - Usage lines: "Used by: Node (param)" / "Written by: Node"
    - Delete button (hidden if readonly), triggers `onDelete`
  - [ ] When delete clicked on a field with usage, show inline warning + confirm/cancel
  - [ ] Use `useState` for `confirmDelete` flag

### computeFieldUsage utility

- [ ] Add `computeFieldUsage` function to `StatePanel.tsx` (or a separate utils file)
  - [ ] Import `extractRootKey` from `../canvas/runInputUtils`
  - [ ] Scan all llm/tool nodes for output_key matches (writers)
  - [ ] Scan all llm/tool nodes' input_map values for root key matches (readers)
  - [ ] Return `{ readers: { nodeLabel, paramName }[], writers: { nodeLabel }[] }`

### AddFieldForm component

- [ ] Create `packages/canvas/src/components/panels/AddFieldForm.tsx`
  - [ ] Props: `existingKeys: Set<string>`, `onAdd: (field: StateField) => void`
  - [ ] State: `key`, `type`, `reducer`, `error`
  - [ ] Render:
    - Text input for key (placeholder "field_name")
    - Select for type (string, number, boolean, list, object)
    - Select for reducer (replace, append, merge)
    - Add button
  - [ ] Validation on submit:
    - Key not empty -> "Field key is required"
    - Key matches `/^[a-z][a-z0-9_]*$/` -> "Use lowercase letters, numbers, and underscores"
    - Key not in existingKeys -> "Field already exists"
  - [ ] On valid submit: call `onAdd({ key, type, reducer })`, clear form

### CanvasRoute

- [ ] Open `packages/canvas/src/components/canvas/CanvasRoute.tsx`
  - [ ] Import StatePanel from `../panels/StatePanel`
  - [ ] Add `<StatePanel />` inside `<main>`, before `<NodeConfigPanel />`

### Tests

- [ ] Create `packages/canvas/src/components/panels/__tests__/StatePanel.test.tsx`
  - [ ] Mock graphSlice with test state fields and nodes
  - [ ] Mock CanvasContext with statePanelOpen=true
  - [ ] Test: renders field keys
  - [ ] Test: shows type and reducer badges
  - [ ] Test: readonly field has RO badge and no delete button
  - [ ] Test: add field form validates and adds
  - [ ] Test: delete unused field works immediately
  - [ ] Test: delete used field shows warning

### Verify

- [ ] `cd packages/canvas && pnpm tsc --noEmit`
- [ ] `cd packages/canvas && pnpm test`
