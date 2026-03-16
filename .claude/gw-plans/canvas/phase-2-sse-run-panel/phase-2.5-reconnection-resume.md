# Phase 2.5 — Reconnection + Resume UI

## Goal

Implement the full SSE reconnection state machine with exponential backoff,
and the human-in-the-loop resume form for paused runs.

## Depends on

- 2.1 (SSE service layer — `connectStream`, `getRunStatus`)
- 2.4 (Run panel — where resume UI is rendered)

## Files to create/modify

| File | Action |
|------|--------|
| `packages/canvas/src/store/runSlice.ts` | Extend `_handleStreamError` with reconnection |
| `packages/canvas/src/components/panels/ResumeForm.tsx` | Create |
| `packages/canvas/src/components/panels/RunPanel.tsx` | Integrate ResumeForm + connection lost banner |

## Reconnection state machine

From gw-frontend skill — this is the authoritative spec:

```
CONNECTED → graph_completed → COMPLETED  (normal path)
          ↘ connection drops unexpectedly
            → RECONNECTING (backoff: 1s → 2s → 4s, max 3 attempts)
            → GET /runs/{id}/status
              { status: "completed" } → replay terminal event → COMPLETED
              { status: "running"   } → reattach to /stream   → CONNECTED
              { status: "paused"    } → show resume UI        → PAUSED
              404 / server error      → FAILED, show banner
            → 3 failed attempts → FAILED
```

### Concurrency guard

Add a module-level flag to prevent parallel reconnection chains. If two
`onerror` events fire in rapid succession, both `_handleStreamError` calls
read `reconnectAttempts` at the same time and spawn duplicate chains.

```typescript
let reconnecting = false;  // module-level, alongside cleanup and terminalReceived
```

### Implementation in `_handleStreamError`

Replace the Phase 2.2 stub with full reconnection:

```typescript
_handleStreamError: async (_error) => {
  // Guard: skip if terminal event received (onerror race — see 2.2)
  if (terminalReceived) return;

  // Guard: prevent concurrent reconnection chains
  if (reconnecting) return;

  const state = useRunStore.getState();
  if (state.runStatus === "completed" || state.runStatus === "error") return;
  if (!state.activeRunId) return;

  reconnecting = true;

  const attempt = state.reconnectAttempts + 1;
  if (attempt > 3) {
    reconnecting = false;
    set({
      runStatus: "connection_lost",
      errorMessage: "Connection lost after 3 attempts",
    });
    showToast("Connection lost — run may still be executing on the server", "error");
    return;
  }

  set({ runStatus: "reconnecting", reconnectAttempts: attempt });

  // Exponential backoff: 1s, 2s, 4s
  await sleep(1000 * Math.pow(2, attempt - 1));

  try {
    const status = await getRunStatus(state.activeRunId);

    switch (status.status) {
      case "completed":
        reconnecting = false;
        set({
          runStatus: "completed",
          finalState: status.final_state,
          durationMs: status.duration_ms,
          activeNodeId: null,
        });
        break;

      case "running": {
        // Reattach SSE with last known event ID
        const { _handleEvent, _handleStreamError, lastEventId } =
          useRunStore.getState();
        cleanup = connectStream(state.activeRunId, {
          onEvent: _handleEvent,
          onError: _handleStreamError,
        }, lastEventId);
        reconnecting = false;
        set({ runStatus: "running", reconnectAttempts: 0 });
        break;
      }

      case "paused":
        reconnecting = false;
        set({
          runStatus: "paused",
          activeNodeId: status.node_id,
          pausedPrompt: status.prompt,
        });
        break;

      case "error":
        reconnecting = false;
        set({
          runStatus: "error",
          errorMessage: status.error ?? "Run failed on server",
          activeNodeId: null,
        });
        break;
    }
  } catch {
    // Status check failed — retry (reset guard so recursive call proceeds)
    reconnecting = false;
    useRunStore.getState()._handleStreamError(new Error("Status check failed"));
  }
}
```

### `sleep` utility

```typescript
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

### `lastEventId` tracking

Already handled in Parts 2.1 and 2.2: `connectStream` passes `eventId` to
`onEvent`, and `_handleEvent` stores it in `lastEventId`. On reconnection,
`lastEventId` is passed to `connectStream` which adds it as
`?last_event_id=N` — the server replays buffered events after that ID.

## Resume UI

When `runStatus === "paused"`, the run panel shows a resume form.

### ResumeForm component

```typescript
interface ResumeFormProps {
  prompt: string;        // from graph_paused event
  onSubmit: (input: unknown) => void;
}

export function ResumeForm({ prompt, onSubmit }: ResumeFormProps) {
  const [value, setValue] = useState("");

  return (
    <div className="border-t border-zinc-700 p-3">
      <p className="text-sm text-zinc-300 mb-2">{prompt}</p>
      <div className="flex gap-2">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Type your response..."
          className="flex-1"
        />
        <Button onClick={() => onSubmit(value)} disabled={!value.trim()}>
          Resume
        </Button>
      </div>
    </div>
  );
}
```

### Integration in RunPanel

```typescript
// In RunPanel, after the event list:
{runStatus === "paused" && pausedPrompt && (
  <ResumeForm
    prompt={pausedPrompt}
    onSubmit={(input) => useRunStore.getState().resumeRun(input)}
  />
)}
```

### Resume flow (race condition safe)

Already implemented in Phase 2.2's `resumeRun` — opens new SSE connection
before the POST returns. The server has a 2-second timeout waiting for the
SSE listener.

Sequence:
1. User types response, clicks Resume
2. `resumeRun(input)` called
3. Old SSE connection closed
4. **New SSE connection opened immediately**
5. `POST /runs/{id}/resume` sent
6. Server detects SSE listener, feeds input to LangGraph
7. Execution continues, events flow to new connection

## Connection lost banner

When `runStatus === "connection_lost"` (3 failed reconnection attempts), show
a persistent banner in the run panel:

```
⚠ Connection lost — the run may still be executing on the server.
[Retry Connection]  [Dismiss]
```

"Retry Connection" resets `reconnectAttempts` to 0 and triggers
`_handleStreamError` again to restart the reconnection cycle.

## Tests

### `packages/canvas/src/store/__tests__/runSlice.reconnect.test.ts`

Mock `getRunStatus`, `connectStream`, and `sleep` (via `vi.useFakeTimers`).

| Test | What it verifies |
|------|-----------------|
| `reconnects with exponential backoff` | Delays are 1s, 2s, 4s |
| `recovers on status=running` | Opens new SSE, resets attempts, status → running |
| `recovers on status=completed` | Sets finalState/durationMs, status → completed |
| `recovers on status=paused` | Sets pausedPrompt, status → paused |
| `recovers on status=error` | Sets errorMessage, status → error |
| `gives up after 3 attempts` | Status → connection_lost, toast shown |
| `status check failure triggers retry` | Recursive call to _handleStreamError |
| `lastEventId passed to connectStream on reattach` | connectStream called with stored lastEventId |
| `concurrent onerror during reconnection is ignored` | Second call returns immediately via `reconnecting` guard |
| `reconnecting flag resets on success` | Flag is false after status=running recovery |
| `reconnecting flag resets on give-up` | Flag is false after 3 failed attempts |

### `packages/canvas/src/components/panels/__tests__/ResumeForm.test.tsx`

| Test | What it verifies |
|------|-----------------|
| `renders prompt text` | Prompt from graph_paused shown |
| `submit button disabled when empty` | Can't submit empty input |
| `calls onSubmit with input value` | Submit fires with typed value |

## Acceptance criteria

- [ ] `reconnecting` guard prevents concurrent reconnection chains
- [ ] `reconnecting` reset on success, give-up, and retry
- [ ] Reconnection attempts with exponential backoff (1s → 2s → 4s)
- [ ] Status check determines correct recovery path (completed/running/paused/error)
- [ ] Successful reconnection resets attempt counter
- [ ] 3 failed attempts → `connection_lost` status + banner
- [ ] `lastEventId` tracked and passed to `connectStream` on reconnect
- [ ] Server replays buffered events after the last seen ID
- [ ] ResumeForm shows prompt and input field when paused
- [ ] Resume opens new SSE before POST (race condition safe)
- [ ] Connection lost banner with manual retry option
- [ ] `tsc --noEmit` passes
