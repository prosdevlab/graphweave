# Phase 2.1 — SSE Service Layer

## Goal

Replace the `runs.ts` stub with a production-ready SSE service layer that
handles typed event parsing, reconnection via `Last-Event-ID`, and clean
teardown.

## Files to modify

| File | Action |
|------|--------|
| `packages/canvas/src/api/runs.ts` | Rewrite |
| `packages/canvas/src/api/client.ts` | Export `apiUrl()` helper |

## Design

### `apiUrl()` helper

The base `request()` in `client.ts` already uses `BASE_URL = "/api"`. SSE
uses `EventSource` which doesn't go through `request()`, so we export a
shared `apiUrl(path)` function.

```typescript
// client.ts
const BASE_URL = "/api";  // existing — Vite proxy rewrites /api → /v1

export function apiUrl(path: string): string {
  return `${BASE_URL}${path}`;
}
```

Refactor `request()` to use `apiUrl()` internally. The `/api` prefix is
critical — it routes through the Vite dev proxy (which rewrites `/api` to
`/v1` and forwards to `localhost:8000`). In production, the reverse proxy
does the same. **Never use `http://localhost:8000/v1` directly** — that
bypasses the proxy and breaks EventSource auth.

### `runs.ts` — five exports

```typescript
// 1. Start a run — POST /api/graphs/{graph_id}/run
export async function startRun(
  graphId: string,
  input?: Record<string, unknown>,
): Promise<{ run_id: string; status: string }>

// 2. Connect to SSE stream — GET /api/runs/{run_id}/stream
//    Returns a cleanup function. Caller provides typed handlers.
export function connectStream(
  runId: string,
  handlers: StreamHandlers,
  lastEventId?: number,
): () => void

// 3. Resume a paused run — POST /api/runs/{run_id}/resume
export async function resumeRun(
  runId: string,
  input: unknown,
): Promise<{ status: string }>

// 4. Cancel a run — POST /api/runs/{run_id}/cancel
export async function cancelRun(runId: string): Promise<void>

// 5. Get run status — GET /api/runs/{run_id}/status
export async function getRunStatus(
  runId: string,
): Promise<RunStatusResponse>
```

### `StreamHandlers` type

```typescript
export interface StreamHandlers {
  onEvent: (event: GraphEvent, eventId: number | null) => void;
  onError: (error: Error) => void;
}
```

Note: **No `onClose` handler.** `EventSource` has no native close event.
When the server ends the stream, EventSource fires `onerror`. Terminal
events (`graph_completed`, non-recoverable `error`) are detected by the
store via `_handleEvent`, not via a separate close signal.

### `startRun` implementation

```typescript
export async function startRun(
  graphId: string,
  input?: Record<string, unknown>,
): Promise<{ run_id: string; status: string }> {
  return request<{ run_id: string; status: string }>(
    `/graphs/${encodeURIComponent(graphId)}/run`,
    {
      method: "POST",
      body: JSON.stringify({ input: input ?? {} }),
    },
  );
}
```

Note: The `input` value is wrapped in `{ input: ... }` to match the server's
`StartRunRequest` schema. Encoding happens here in the service layer —
callers pass raw IDs.

### `connectStream` implementation

```typescript
export function connectStream(
  runId: string,
  handlers: StreamHandlers,
  lastEventId?: number,
): () => void {
  const encoded = encodeURIComponent(runId);
  const params = lastEventId != null ? `?last_event_id=${lastEventId}` : "";
  const url = apiUrl(`/runs/${encoded}/stream${params}`);

  const source = new EventSource(url);

  // Listen for each known event type (server sends typed SSE events)
  const EVENT_TYPES = [
    "run_started", "node_started", "node_completed",
    "edge_traversed", "graph_paused", "graph_completed", "error",
  ] as const;

  for (const type of EVENT_TYPES) {
    source.addEventListener(type, (e: MessageEvent) => {
      const eventId = e.lastEventId ? Number(e.lastEventId) : null;
      try {
        const data = JSON.parse(e.data);
        handlers.onEvent({ event: type, data } as GraphEvent, eventId);
      } catch {
        // Malformed SSE data — skip event, don't crash
      }
    });
  }

  source.onerror = () => {
    source.close();
    handlers.onError(new Error("SSE connection lost"));
  };

  return () => {
    source.close();
  };
}
```

Key decisions:
- **Named event listeners** (`addEventListener(type, ...)`) instead of
  `onmessage` because the server sends typed SSE events (`event: node_started`),
  not generic `message` events.
- **`eventId` passed to handler** so the store can track `lastEventId` for
  reconnection replay.
- **No auto-reconnect** — `EventSource` has built-in reconnection but we
  disable it (close on error) because the reconnection state machine in
  `runSlice` needs to control backoff and status-check logic.
- **JSON parse errors caught** — malformed data is silently skipped rather
  than crashing the event loop.

### `resumeRun` implementation

```typescript
export async function resumeRun(
  runId: string,
  input: unknown,
): Promise<{ status: string }> {
  return request<{ status: string }>(
    `/runs/${encodeURIComponent(runId)}/resume`,
    {
      method: "POST",
      body: JSON.stringify({ input }),
    },
  );
}
```

Note: Input wrapped in `{ input: ... }` to match `ResumeRunRequest` schema.

### `cancelRun` implementation

```typescript
export async function cancelRun(runId: string): Promise<void> {
  await request(`/runs/${encodeURIComponent(runId)}/cancel`, {
    method: "POST",
  });
}
```

Server returns `{ detail: "Cancel requested" }` — we ignore the response body.

### `getRunStatus` implementation

```typescript
export async function getRunStatus(
  runId: string,
): Promise<RunStatusResponse> {
  return request<RunStatusResponse>(
    `/runs/${encodeURIComponent(runId)}/status`,
  );
}
```

### `RunStatusResponse` type

```typescript
export interface RunStatusResponse {
  run_id: string;
  graph_id: string;
  status: "running" | "paused" | "completed" | "error";
  node_id: string | null;
  prompt: string | null;
  final_state: unknown | null;
  duration_ms: number | null;
  error: string | null;
}
```

### Authentication for EventSource

`EventSource` doesn't support custom headers. Auth works via the Vite proxy:

- **Dev**: Vite proxy rewrites `/api` → `/v1` and forwards to `localhost:8000`.
  The API key is injected by the proxy (or the execution server runs without
  auth in dev mode).
- **Production**: Same-origin reverse proxy handles the rewrite. No API key
  in browser URLs.

The existing Vite proxy config already covers `/api/*`, which includes
`/api/runs/{id}/stream`. No proxy changes needed.

## Tests

### `packages/canvas/src/api/__tests__/runs.test.ts`

Mock `fetch` via `vi.fn()` and `EventSource` via a lightweight mock.

| Test | What it verifies |
|------|-----------------|
| `startRun sends correct URL and body shape` | URL is `/api/graphs/{encoded}/run`, body is `{ input: {} }` |
| `startRun encodes graph ID with special chars` | `my graph#1` → `/api/graphs/my%20graph%231/run` |
| `connectStream listens for all 7 event types` | `addEventListener` called for each type |
| `connectStream passes eventId to handler` | `e.lastEventId` forwarded as number |
| `connectStream handles JSON parse errors` | Malformed data doesn't crash, handler not called |
| `connectStream cleanup closes EventSource` | `source.close()` called |
| `resumeRun wraps input in request body` | Body is `{ input: <value> }` |
| `cancelRun sends POST to correct URL` | URL is `/api/runs/{encoded}/cancel` |
| `getRunStatus returns typed response` | Response shape matches `RunStatusResponse` |

### EventSource mock strategy

```typescript
class MockEventSource {
  listeners = new Map<string, Function>();
  addEventListener(type: string, fn: Function) { this.listeners.set(type, fn); }
  close = vi.fn();
  // Simulate: mockSource.emit("node_started", { ... })
  emit(type: string, data: unknown, id?: string) {
    this.listeners.get(type)?.({ data: JSON.stringify(data), lastEventId: id });
  }
}
vi.stubGlobal("EventSource", MockEventSource);
```

## Acceptance criteria

- [ ] `startRun()` calls `/api/graphs/{encoded}/run` with body `{ input: ... }`
- [ ] `connectStream()` receives typed events and calls `onEvent` with `GraphEvent` + `eventId`
- [ ] `connectStream()` returns a cleanup function that closes the EventSource
- [ ] `connectStream()` supports `lastEventId` query param for reconnection replay
- [ ] `connectStream()` catches JSON parse errors without crashing
- [ ] `resumeRun()` wraps input in `{ input: ... }` body
- [ ] `cancelRun()` sends POST, ignores response body
- [ ] `getRunStatus()` returns typed `RunStatusResponse`
- [ ] All URLs use `encodeURIComponent()` on path params
- [ ] All URLs use `/api` prefix (goes through Vite proxy)
- [ ] No `onClose` in `StreamHandlers` (EventSource has no close event)
- [ ] `apiUrl()` exported from `client.ts`, used by both `request()` and EventSource
- [ ] `tsc --noEmit` passes
- [ ] Unit tests pass
