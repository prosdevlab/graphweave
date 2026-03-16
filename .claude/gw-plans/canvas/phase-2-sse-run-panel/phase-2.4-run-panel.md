# Phase 2.4 — Run Panel + Node Highlighting

## Goal

Build the run output panel that shows real-time execution events, and
highlight the active node on the canvas during a run.

## Depends on

- 2.2 (RunSlice)

## Files to create/modify

| File | Action |
|------|--------|
| `packages/canvas/src/components/panels/RunPanel.tsx` | Create |
| `packages/canvas/src/components/panels/RunEventItem.tsx` | Create |
| `packages/canvas/src/components/canvas/CanvasRoute.tsx` | Add RunPanel |
| `packages/canvas/src/components/canvas/GraphCanvas.tsx` | Active node class |
| `packages/canvas/src/components/canvas/nodes/BaseNodeShell.tsx` | Active node CSS |
| `packages/canvas/src/components/ui/Sheet.tsx` | Add `"bottom"` side support |
| `packages/canvas/src/styles/tokens.ts` | Add node-active animation tokens |

## Run panel design

The panel shows a live timeline of execution events. It opens automatically
when a run starts and stays open until dismissed.

### Layout

Uses the existing `Sheet` component extended with `side: "bottom"`:

```
┌──────────────────────────────────────────────┐
│  Canvas Header                    [▶ Run]    │
├──────────────────────────────────────────────┤
│                                              │
│              React Flow Canvas               │
│                                              │
├──────────────────────────────────────────────┤
│  Run Output                          [✕]     │
│  ┌──────────────────────────────────────┐    │
│  │ ▶ run_started         12:34:05       │    │
│  │ ● node_started: llm_1  12:34:05      │    │
│  │ ✓ node_completed: llm_1  1.2s        │    │
│  │ → edge_traversed: llm_1 → end_1     │    │
│  │ ✓ graph_completed       3.4s         │    │
│  └──────────────────────────────────────┘    │
└──────────────────────────────────────────────┘
```

### Panel positioning

Read `useUIStore.panelLayout` to determine position:
- `"bottom"` — panel slides up from bottom (default during runs)
- `"right"` — panel slides in from right (shares space with config panel)

For Phase 2, default to bottom. The toggle can be added later.

### Sheet `"bottom"` support

The current Sheet has `h-full w-80` hardcoded in the outer div's class
string. Adding `"bottom"` requires pulling size classes into the
`sideClasses` map so each side controls its own dimensions.

Refactor the Sheet component:

```typescript
type SheetSide = "left" | "right" | "bottom";

const sideClasses: Record<SheetSide, {
  position: string; border: string;
  openTransform: string; closedTransform: string;
  size: string;
}> = {
  left: {
    position: "left-0 top-0",
    border: "border-r",
    openTransform: "translate-x-0",
    closedTransform: "-translate-x-full",
    size: "h-full w-80",
  },
  right: {
    position: "right-0 top-0",
    border: "border-l",
    openTransform: "translate-x-0",
    closedTransform: "translate-x-full",
    size: "h-full w-80",
  },
  bottom: {
    position: "inset-x-0 bottom-0",
    border: "border-t",
    openTransform: "translate-y-0",     // ← must be Y-axis, not X
    closedTransform: "translate-y-full",
    size: "w-full h-64",
  },
};
```

The outer div template changes from:
```
`absolute ${position} top-0 z-20 h-full w-80 ${border} ... ${open ? "translate-x-0" : transform}`
```
to:
```
`absolute ${position} z-20 ${size} ${border} ... ${open ? openTransform : closedTransform}`
```

Key changes:
- `top-0` moves into the left/right `position` entries (bottom uses `bottom-0`)
- `h-full w-80` moves into `size` per variant
- `openTransform` is split from `closedTransform` — bottom needs `translate-y-0`,
  not `translate-x-0`
```

## RunPanel component

```typescript
interface RunPanelProps {
  // No props — reads from useRunStore directly
}

export function RunPanel() {
  const runStatus = useRunStore(s => s.runStatus);
  const runOutput = useRunStore(s => s.runOutput);
  const durationMs = useRunStore(s => s.durationMs);
  const errorMessage = useRunStore(s => s.errorMessage);

  // Don't render if no run has been started
  if (runStatus === "idle") return null;

  return (
    <Sheet open={runStatus !== "idle"} onClose={handleClose} title={title} side="bottom">
      <div className="flex flex-col gap-1 overflow-y-auto">
        {runOutput.map((event, i) => (
          <RunEventItem key={i} event={event} />
        ))}
        {runStatus === "completed" && (
          <div>Completed in {formatDuration(durationMs)}</div>
        )}
        {runStatus === "error" && (
          <div className="text-red-400">{errorMessage}</div>
        )}
        {runStatus === "connection_lost" && (
          <div className="text-amber-400">Connection lost — reconnecting...</div>
        )}
      </div>
    </Sheet>
  );
}
```

### Auto-scroll

The event list auto-scrolls to the bottom as new events arrive:

```typescript
const endRef = useRef<HTMLDivElement>(null);
useEffect(() => {
  endRef.current?.scrollIntoView({ behavior: "smooth" });
}, [runOutput.length]);
```

### Panel close behavior

Closing the panel does NOT cancel the run. It just hides the panel. The run
continues in the background (node highlighting still active). Re-open by
clicking a "Show run" indicator in the header.

## RunEventItem component

Renders a single event row with icon, label, and timestamp/duration:

```typescript
function RunEventItem({ event }: { event: GraphEvent }) {
  // Icon + color per event type:
  // run_started    → ▶ blue
  // node_started   → ● amber (spinning)
  // node_completed → ✓ green + duration
  // edge_traversed → → zinc-400
  // graph_paused   → ⏸ amber + prompt text
  // graph_completed → ✓✓ green + total duration
  // error          → ✗ red + message
}
```

Keep it simple — single line per event, monospace-friendly.

## Active node highlighting

When `activeNodeId` is set in the run store, the corresponding node on the
canvas gets a pulsing border.

### In BaseNodeShell

`BaseNodeShell` does not currently accept an `id` prop. Use React Flow's
`useNodeId()` hook instead of threading `id` through all node components:

```typescript
import { useNodeId } from "@xyflow/react";

export function BaseNodeShell({ children, ... }: Props) {
  const nodeId = useNodeId();  // provided by React Flow context
  const activeNodeId = useRunStore(s => s.activeNodeId);
  const isActive = activeNodeId === nodeId;

  return (
    <div className={cn(
      "rounded-lg border ...",
      isActive && "node-active",
    )}>
      {children}
    </div>
  );
}
```

No changes needed to `StartNode`, `LLMNode`, or `EndNode` — `useNodeId()`
reads from React Flow's internal context, which is already provided per-node.
```

### CSS animation (in tokens.ts or a CSS file)

```css
.node-active {
  border-color: var(--color-blue-400);
  box-shadow: 0 0 12px rgba(96, 165, 250, 0.4);
  animation: node-pulse 1.5s ease-in-out infinite;
}

@keyframes node-pulse {
  0%, 100% { box-shadow: 0 0 8px rgba(96, 165, 250, 0.3); }
  50% { box-shadow: 0 0 16px rgba(96, 165, 250, 0.6); }
}
```

### Completed/error node states

After a run completes, briefly show completion state on nodes:
- Nodes that completed successfully: green border flash (1s)
- Node that errored: red border

This is derived from `runOutput` — scan for `node_completed` and `error`
events. Reset when `resetRun()` is called.

## CanvasRoute integration

```typescript
// CanvasRoute.tsx
<main className="relative h-[calc(100vh-3rem)]">
  <GraphCanvas />
  <NodeConfigPanel />
  <RunPanel />
</main>
```

The RunPanel renders conditionally (returns null when idle). Sheet handles
the slide animation.

## Canvas height adjustment

When the bottom panel is open, the React Flow canvas needs to shrink to
avoid overlap. Two approaches:

1. **Overlay** — panel floats over canvas (simpler, may obscure nodes)
2. **Resize** — canvas height adjusts when panel opens

**Decision: Overlay for Phase 2.** The panel is 256px tall and semi-transparent
at the top edge. Users can scroll/zoom the canvas. Phase 5 can add resize
behavior if needed.

## Tests

### `packages/canvas/src/components/ui/__tests__/Sheet.test.tsx`

| Test | What it verifies |
|------|-----------------|
| `renders full-width bottom variant` | Bottom sheet has `w-full h-64` classes |
| `slide-up animation on bottom open` | `translate-y-0` when open, `translate-y-full` when closed |
| `right variant still works after refactor` | `w-80 h-full` classes unchanged |

### `packages/canvas/src/components/panels/__tests__/RunPanel.test.tsx`

| Test | What it verifies |
|------|-----------------|
| `returns null when status is idle` | No DOM rendered |
| `renders event timeline during run` | RunEventItem for each event in runOutput |
| `shows completion duration` | Duration displayed when status is completed |
| `shows error message` | Red error text when status is error |
| `scrolls to bottom on new event` | `scrollIntoView` called on endRef |

### `packages/canvas/src/components/panels/__tests__/RunEventItem.test.tsx`

| Test | What it verifies |
|------|-----------------|
| `renders icon and label per event type` | Correct icon for each of 7 event types |

## Acceptance criteria

- [ ] Sheet `sideClasses` includes size (no hardcoded `w-80` in template)
- [ ] Sheet supports `side="bottom"` with slide-up animation
- [ ] RunPanel shows live event timeline during run
- [ ] Events auto-scroll to bottom
- [ ] Active node gets pulsing blue border during execution
- [ ] Completed run shows total duration
- [ ] Error state shows error message in red
- [ ] Panel close hides panel but doesn't cancel run
- [ ] RunPanel mounts in CanvasRoute alongside NodeConfigPanel
- [ ] `tsc --noEmit` passes
- [ ] Unit tests pass
