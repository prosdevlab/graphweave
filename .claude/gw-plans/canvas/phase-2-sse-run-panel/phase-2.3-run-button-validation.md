# Phase 2.3 — Run Button + Client-Side Validation

## Goal

Add a Run button to the canvas header that validates the graph before
starting execution. Show validation errors as highlighted nodes + toast.

## Depends on

- 2.2 (RunSlice)

## Files to create/modify

| File | Action |
|------|--------|
| `packages/canvas/src/utils/validateGraph.ts` | Create |
| `packages/canvas/src/components/canvas/CanvasHeader.tsx` | Add Run/Stop button |
| `packages/canvas/src/components/canvas/RunInputDialog.tsx` | Create — simple input dialog |

## Validation rules (Phase 2 subset)

Only validate what Phase 2 nodes support (Start, LLM, End):

```typescript
interface ValidationError {
  message: string;
  nodeId?: string;  // for highlighting
}

export function validateGraph(
  nodes: NodeSchema[],
  edges: EdgeSchema[],
): ValidationError[] {
  const errors: ValidationError[] = [];

  // 1. Exactly one Start node
  const starts = nodes.filter(n => n.type === "start");
  if (starts.length === 0) errors.push({ message: "Start node required" });
  if (starts.length > 1) errors.push({ message: "Only one Start node allowed", nodeId: starts[1].id });

  // 2. At least one End node
  const ends = nodes.filter(n => n.type === "end");
  if (ends.length === 0) errors.push({ message: "End node required" });

  // 3. All nodes connected (no orphans)
  const connectedIds = new Set(edges.flatMap(e => [e.source, e.target]));
  for (const node of nodes) {
    if (!connectedIds.has(node.id)) {
      errors.push({ message: `${node.type} node is disconnected`, nodeId: node.id });
    }
  }

  // 4. LLM nodes have a system prompt
  for (const node of nodes) {
    if (node.type === "llm" && !node.config.system_prompt?.trim()) {
      errors.push({ message: "LLM node needs a system prompt", nodeId: node.id });
    }
  }

  return errors;
}
```

## Run button behavior

The CanvasHeader gets a Run/Stop button on the right side:

```
[← Back]  Graph Name *  [Save]  [▶ Run] / [■ Stop]
```

**Important**: Read `nodes` and `edges` via `useGraphStore.getState()` inside
the click handler — not as top-level selectors. `CanvasHeader` is memoized
and subscribing to `nodes`/`edges` would re-render the header on every node
drag.

### States

| `runStatus` | Button | Action |
|-------------|--------|--------|
| `idle` | `▶ Run` | Validate → open input dialog (or start directly) |
| `running` | `■ Stop` | Call `cancelRun()` |
| `paused` | `▶ Resume` | Open resume input (handled by run panel, Part 2.4) |
| `reconnecting` | `■ Stop` (disabled spinner) | Wait for reconnection |
| `completed` | `▶ Run` | Reset + start new run |
| `error` | `▶ Run` | Reset + start new run |
| `connection_lost` | `▶ Run` | Reset + start new run |

### Validation flow

1. User clicks Run
2. `validateGraph(nodes, edges)` runs
3. If errors:
   - Show first error as toast (error variant)
   - If error has `nodeId`, pulse that node red briefly (CSS class)
   - Don't start run
4. If valid:
   - If graph has unsaved changes, auto-save first
   - Open `RunInputDialog` (or skip if no input fields defined)

## RunInputDialog

Simple dialog for providing initial input to the run. Phase 2 keeps it
minimal — a single JSON textarea.

```typescript
// RunInputDialog.tsx
interface RunInputDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: Record<string, unknown>) => void;
}
```

Content:
- Title: "Run Graph"
- Textarea for JSON input (pre-filled with `{}`)
- "Start" and "Cancel" buttons
- JSON parse error shown inline if invalid

Phase 4 replaces this with a schema-driven form based on `GraphSchema.state`
fields. For now, raw JSON is sufficient.

## Validation error highlighting

Add a transient CSS class to nodes with validation errors:

```typescript
// In GraphCanvas or a new hook
const [errorNodeIds, setErrorNodeIds] = useState<Set<string>>(new Set());

// When validation fails:
setErrorNodeIds(new Set(errors.filter(e => e.nodeId).map(e => e.nodeId!)));
setTimeout(() => setErrorNodeIds(new Set()), 3000);  // clear after 3s
```

Node shell reads this to apply a red border pulse:
```css
.node-validation-error {
  animation: error-pulse 0.6s ease-in-out 3;
  border-color: var(--color-red-500);
}
```

## Auto-save before run

If the graph has unsaved changes (`dirty === true`), save before running.
Check for save errors before proceeding.

```typescript
const handleRun = async () => {
  const { nodes, edges, graph, dirty, saveGraph, saveError } =
    useGraphStore.getState();
  if (!graph) return;

  const errors = validateGraph(nodes, edges);
  if (errors.length > 0) { /* show errors */ return; }

  if (dirty) {
    await saveGraph();
    if (useGraphStore.getState().saveError) {
      showToast("Failed to save — fix save errors before running", "error");
      return;
    }
  }

  setInputDialogOpen(true);
};
```

Note: `saveGraph()` catches errors internally and sets `saveError` without
re-throwing. We check `saveError` after awaiting to detect failures.

## RunInputDialog → startRun flow

The `onSubmit` callback must close over `graph.id`:

```typescript
<RunInputDialog
  open={inputDialogOpen}
  onClose={() => setInputDialogOpen(false)}
  onSubmit={(input) => {
    setInputDialogOpen(false);
    useRunStore.getState().startRun(graph!.id, input);
  }}
/>
```

`graph.id` comes from `useGraphStore(s => s.graph)` which CanvasHeader
already subscribes to (for the name display). The `!` assertion is safe
because the Run button is only enabled when `graph` is non-null.

## Tests

### `packages/canvas/src/utils/__tests__/validateGraph.test.ts`

| Test | What it verifies |
|------|-----------------|
| `valid graph passes` | Start → LLM → End with system prompt returns [] |
| `missing Start node` | Error with "Start node required" |
| `missing End node` | Error with "End node required" |
| `disconnected node` | Error with nodeId pointing to orphan |
| `LLM without system prompt` | Error with nodeId pointing to LLM |
| `multiple Start nodes` | Error on second Start node |

### `packages/canvas/src/components/canvas/__tests__/CanvasHeader.test.tsx`

Mock `useRunStore` and `useGraphStore`.

| Test | What it verifies |
|------|-----------------|
| `shows Run button in idle` | Button text is "Run" |
| `shows Stop button when running` | Button text is "Stop" |
| `Run button triggers validation` | `validateGraph` called on click |
| `auto-saves before run when dirty` | `saveGraph` called when `dirty === true` |

### `packages/canvas/src/components/canvas/__tests__/RunInputDialog.test.tsx`

| Test | What it verifies |
|------|-----------------|
| `renders JSON textarea` | Pre-filled with `{}` |
| `rejects invalid JSON` | Error shown, submit disabled |
| `calls onSubmit with parsed JSON` | Valid JSON parsed and passed |

## Acceptance criteria

- [ ] `validateGraph()` catches missing Start/End, orphan nodes, empty LLM prompts
- [ ] Run button appears in CanvasHeader, changes label/action based on `runStatus`
- [ ] Validation errors show as toast + node highlighting (3s auto-clear)
- [ ] RunInputDialog opens for JSON input, validates JSON before submit
- [ ] Graph auto-saves before run if dirty
- [ ] Stop button calls `cancelRun()`
- [ ] `tsc --noEmit` passes
- [ ] Unit tests pass
