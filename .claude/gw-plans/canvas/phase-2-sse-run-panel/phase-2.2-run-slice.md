# Phase 2.2 — RunSlice Implementation

## Goal

Implement the full run lifecycle state machine in `runSlice.ts` — start a
run, dispatch SSE events to state, highlight active node, handle completion
and errors.

## Depends on

- 2.1 (SSE service layer)

## Files to modify

| File | Action |
|------|--------|
| `packages/canvas/src/store/runSlice.ts` | Rewrite stub |

## State shape

```typescript
export type RunStatus =
  | "idle"
  | "running"
  | "paused"
  | "reconnecting"
  | "completed"
  | "error"
  | "connection_lost";

export interface RunSlice {
  // State
  activeRunId: string | null;
  runStatus: RunStatus;
  activeNodeId: string | null;
  runOutput: GraphEvent[];
  reconnectAttempts: number;
  lastEventId: number;
  finalState: unknown | null;
  durationMs: number | null;
  errorMessage: string | null;
  pausedPrompt: string | null;

  // Actions
  startRun: (graphId: string, input?: Record<string, unknown>) => Promise<void>;
  cancelRun: () => Promise<void>;
  resumeRun: (input: unknown) => Promise<void>;
  resetRun: () => void;

  // Internal — called by SSE event handlers, not by components
  _handleEvent: (event: GraphEvent, eventId: number | null) => void;
  _handleStreamError: (error: Error) => void;
  _disconnect: () => void;
}
```

### Private state (module closure, not in Zustand)

```typescript
let cleanup: (() => void) | null = null;
let terminalReceived = false;  // guards against onerror after graph_completed/error
```

The EventSource cleanup reference and terminal guard are held in the module
closure, not in Zustand state, because they're not serializable and
components don't need them.

**Why `terminalReceived`?** When a terminal event (`graph_completed` or
non-recoverable `error`) arrives, `_handleEvent` calls `cleanup()` which
closes the EventSource. Closing an EventSource synchronously fires `onerror`.
If `onerror` runs before `set()` commits the new status, `_handleStreamError`
would see `runStatus === "running"` and trigger reconnection — even though
the run is actually done. The flag prevents this race.

## State machine

```
                    ┌──────────────┐
                    │     idle     │
                    └──────┬───────┘
                           │ startRun()
                    ┌──────▼───────┐
              ┌─────│   running    │◄────────────────┐
              │     └──┬───┬───┬───┘                  │
              │        │   │   │                      │
   connection │  graph_│   │   │ graph_    reconnect  │
   error      │  paused│   │   │ completed  success   │
              │        │   │   │                      │
       ┌──────▼──┐  ┌──▼───┘  ┌▼──────────┐  ┌──────┴──────┐
       │  error  │  │ paused│  │ completed  │  │reconnecting │
       └─────────┘  └───────┘  └───────────┘  └─────────────┘
              ▲                                       │
              └───────── 3 failures ──────────────────┘
```

`cancelRun()` from `running` or `paused` → `idle`.
`resetRun()` from any state → `idle`.

## Event dispatch (`_handleEvent`)

**Important**: `cleanup()` calls (which close the EventSource and may trigger
`onerror`) must happen **outside** the `set()` callback to prevent re-entrant
state updates.

```typescript
_handleEvent: (event, eventId) => {
  // Close connection on terminal events BEFORE updating state.
  // Set terminalReceived flag to prevent onerror → reconnection race.
  if (event.event === "graph_completed" ||
      (event.event === "error" && !event.data.recoverable)) {
    terminalReceived = true;
    cleanup?.();
    cleanup = null;
  }

  set((s) => {
    const output = [...s.runOutput, event];
    const base = { runOutput: output, lastEventId: eventId ?? s.lastEventId };

    switch (event.event) {
      case "run_started":
        return { ...base, runStatus: "running" };

      case "node_started":
        return { ...base, activeNodeId: event.data.node_id };

      case "node_completed":
        return base;
        // activeNodeId stays until next node_started or completion

      case "edge_traversed":
        return base;

      case "graph_paused":
        return {
          ...base,
          runStatus: "paused",
          activeNodeId: event.data.node_id,
          pausedPrompt: event.data.prompt,
        };

      case "graph_completed":
        return {
          ...base,
          runStatus: "completed",
          activeNodeId: null,
          finalState: event.data.final_state,
          durationMs: event.data.duration_ms,
        };

      case "error":
        if (!event.data.recoverable) {
          return {
            ...base,
            runStatus: "error",
            activeNodeId: event.data.node_id ?? s.activeNodeId,
            errorMessage: event.data.message,
          };
        }
        // Recoverable errors: log but don't change status
        return base;

      default:
        return base;
    }
  });
}
```

## `startRun` implementation

```typescript
startRun: async (graphId, input) => {
  // Reset previous run state
  cleanup?.();
  cleanup = null;
  terminalReceived = false;
  set({
    runStatus: "running",
    activeRunId: null,
    activeNodeId: null,
    runOutput: [],
    reconnectAttempts: 0,
    lastEventId: 0,
    finalState: null,
    durationMs: null,
    errorMessage: null,
    pausedPrompt: null,
  });

  try {
    // graphId is passed raw — encoding happens in the service layer
    const { run_id } = await startRunApi(graphId, input);
    set({ activeRunId: run_id });

    const { _handleEvent, _handleStreamError } = useRunStore.getState();
    cleanup = connectStream(run_id, {
      onEvent: _handleEvent,
      onError: _handleStreamError,
    });
  } catch (err) {
    const message = err instanceof ApiError
      ? err.message
      : "Failed to start run";
    set({ runStatus: "error", errorMessage: message });
    useUIStore.getState().showToast(message, "error");
  }
}
```

Note: `graphId` is **not** encoded here. The `startRunApi()` function in the
service layer handles encoding. This avoids double-encoding.

## `cancelRun` implementation

```typescript
cancelRun: async () => {
  const { activeRunId } = useRunStore.getState();
  if (!activeRunId) return;

  // Close connection first, then send cancel
  cleanup?.();
  cleanup = null;

  try {
    await cancelRunApi(activeRunId);
  } catch {
    // Best-effort — run may have already completed
  }
  set({ runStatus: "idle", activeNodeId: null });
}
```

## `resumeRun` implementation (race-condition-safe)

```typescript
resumeRun: async (input) => {
  const { activeRunId, _handleEvent, _handleStreamError } =
    useRunStore.getState();
  if (!activeRunId) return;

  // 1. Close old connection
  cleanup?.();
  cleanup = null;

  // 2. Open NEW SSE connection BEFORE the resume POST returns
  //    (race condition fix per gw-frontend skill — server waits 2s for listener)
  cleanup = connectStream(activeRunId, {
    onEvent: _handleEvent,
    onError: _handleStreamError,
  });

  set({ runStatus: "running", pausedPrompt: null });

  // 3. Send resume request
  try {
    await resumeRunApi(activeRunId, input);
  } catch (err) {
    const message = err instanceof ApiError
      ? err.message
      : "Failed to resume run";
    set({ runStatus: "error", errorMessage: message });
    useUIStore.getState().showToast(message, "error");
  }
}
```

## `resetRun`

```typescript
resetRun: () => {
  cleanup?.();
  cleanup = null;
  terminalReceived = false;
  set({
    activeRunId: null,
    runStatus: "idle",
    activeNodeId: null,
    runOutput: [],
    reconnectAttempts: 0,
    lastEventId: 0,
    finalState: null,
    durationMs: null,
    errorMessage: null,
    pausedPrompt: null,
  });
}
```

## `_handleStreamError`

Sets status to `connection_lost`. The full reconnection logic (backoff,
status polling, reattach) is implemented in Part 2.5. This stub ensures
Part 2.2 is functional standalone.

```typescript
_handleStreamError: (_error) => {
  // Guard: skip if a terminal event was already received (onerror race)
  if (terminalReceived) return;

  cleanup = null;  // connection already closed by service layer
  const { runStatus } = useRunStore.getState();
  // Only react if we're in an active state
  if (runStatus === "running" || runStatus === "reconnecting") {
    set({ runStatus: "connection_lost" });
  }
}
```

## `_disconnect`

Utility for reconnection logic in 2.5 to close the current connection.

```typescript
_disconnect: () => {
  cleanup?.();
  cleanup = null;
}
```

## Tests

### `packages/canvas/src/store/__tests__/runSlice.test.ts`

Mock `startRunApi`, `connectStream`, `cancelRunApi`, `resumeRunApi` from `@api/runs`.

| Test | What it verifies |
|------|-----------------|
| `idle → running on startRun` | Status transitions, `activeRunId` set |
| `startRun error → error status + toast` | API failure sets `errorMessage`, shows toast |
| `node_started sets activeNodeId` | `_handleEvent` with `node_started` |
| `node_completed clears nothing` | `activeNodeId` stays until next `node_started` |
| `graph_paused → paused status + prompt` | Status, `pausedPrompt` set |
| `graph_completed → completed + cleanup` | Status, `finalState`, `durationMs`, cleanup called |
| `non-recoverable error → error status + cleanup` | Status, `errorMessage`, cleanup called |
| `recoverable error → status unchanged` | Only `runOutput` updated |
| `cancelRun closes connection + sends cancel` | Cleanup called, API called, status → idle |
| `resumeRun opens SSE before POST` | `connectStream` called before `resumeRunApi` |
| `resetRun cleans up everything` | All state reset, cleanup called |
| `cleanup() outside set() callback` | No re-entrant state updates on terminal events |
| `lastEventId tracked from event handler` | Increments with each event |
| `onerror after graph_completed does not change status` | `terminalReceived` guard prevents race |
| `startRun resets terminalReceived flag` | Fresh run not blocked by previous terminal |

### Mock strategy

```typescript
// Mock the API module
vi.mock("@api/runs", () => ({
  startRun: vi.fn(),
  connectStream: vi.fn(() => vi.fn()),  // returns cleanup fn
  cancelRun: vi.fn(),
  resumeRun: vi.fn(),
}));
```

## Acceptance criteria

- [ ] `startRun` calls API, stores `run_id`, connects SSE stream
- [ ] `graphId` passed raw to service layer (no double-encoding)
- [ ] SSE events update `runOutput`, `activeNodeId`, `runStatus` correctly
- [ ] `graph_completed` → status `completed`, stream closed **outside** `set()`
- [ ] Non-recoverable `error` → status `error`, stream closed **outside** `set()`
- [ ] `cancelRun` closes stream and sends cancel request
- [ ] `resumeRun` opens new SSE connection before POST (race condition fix)
- [ ] `resetRun` cleans up everything
- [ ] `terminalReceived` flag prevents onerror → reconnection race after completion
- [ ] `terminalReceived` reset in `startRun` and `resetRun`
- [ ] EventSource cleanup ref held in module closure, not Zustand state
- [ ] `useRunStore.getState()` used in callbacks to avoid stale closures
- [ ] Errors shown via `showToast()`
- [ ] `tsc --noEmit` passes
- [ ] Unit tests pass
