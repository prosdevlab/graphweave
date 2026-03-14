# Phase 3: Executor + SSE Streaming -- Overview

## Context

The execution layer has a DB layer with tools and state utils (Phase 1), scoped API key auth with CRUD routes (Phase 1.5), and the GraphSchema-to-LangGraph builder (Phase 2). The builder produces a compiled `StateGraph` via `build_graph()` that returns a `BuildResult(graph, defaults)`. The executor stub in `app/executor.py` has a placeholder `stream_run()` and a `format_sse()` helper.

This phase implements the core execution engine: take a compiled graph, run it, stream SSE events to the client in real time, handle human-in-the-loop interrupts with the full resume protocol, persist run state to the database, and support reconnection recovery.

**This phase also includes a minimal set of routes** (`POST /v1/graphs/{id}/run`, `GET /v1/runs/{id}/stream`, `POST /v1/runs/{id}/resume`, `GET /v1/runs/{id}/status`) so the executor is demoable end-to-end. The remaining routes (validate, export, run history listing) stay in Phase 4.

**URL scheme note**: This plan uses `/v1/runs/{id}/...` for run-specific routes. The PROPOSAL and some skill docs use `/v1/graphs/run/{id}/...`. We deliberately adopt the REST-standard plural resource pattern (`/v1/runs/...`) per the `gw-api-design` skill. The PROPOSAL URLs, `gw-execution` skill doc, and frontend stub (`packages/canvas/src/api/runs.ts`) will be updated during implementation to match.

## Parts

| Part | File | Commit | Summary |
|------|------|--------|---------|
| 3.1 | [builder-checkpointer](3.1-builder-checkpointer.md) | 1 | Add optional `checkpointer` param to `build_graph()` |
| 3.2 | [run-manager](3.2-run-manager.md) | 2a | RunContext, RunManager, helpers (`_emit`, `format_sse`, `_safe_update_run`) |
| 3.3 | [executor-core](3.3-executor-core.md) | 2b | `_execute_run`, `_stream_graph`, `_wait_for_resume`, `stream_run_sse` |
| 3.4 | [routes](3.4-routes.md) | 3 | Pydantic schemas, 4 routes, app wiring |

Parts 3.2 and 3.3 are in the same commit (they are both `app/executor.py`). They are split into separate plan files for readability.

No new Python dependencies are added. Everything needed is already installed: `fastapi` (StreamingResponse), `langgraph` (astream, InMemorySaver, Command), `aiosqlite` (run persistence).

---

## Architecture

### Execution Flow

```
POST /v1/graphs/{id}/run
  { input: {...} }
       |
       v
 +-----------------+
 | Route handler   |  1. Fetch graph from DB
 |                 |  2. build_graph(schema) -> BuildResult
 |                 |  3. create_run(db, ..., status="running")
 |                 |  4. Return { run_id } immediately (202 Accepted)
 |                 |  5. Launch execute_run() as background task
 +-----------------+
       |
       v
 +-----------------+
 | execute_run()   |  Runs in background asyncio task.
 |                 |  Calls graph.astream() with stream_mode="updates".
 |                 |  Pushes SSE events to an asyncio.Queue per run.
 |                 |  Updates run status in DB on completion/error/pause.
 +-----------------+
       |
       | asyncio.Queue (SSE events)
       v
 +-------------------+
 | GET /stream       |  Opens EventSource connection.
 |                   |  Reads from the run's event queue.
 |                   |  Yields SSE-formatted strings.
 |                   |  Closes on graph_completed or error.
 +-------------------+
```

### SSE Event Contract

SSE (Server-Sent Events) is a simple protocol: the server sends a stream of `event: <type>\ndata: <json>\n\n` messages over a long-lived HTTP connection. The browser uses `EventSource` to consume them. Key properties:

- **Unidirectional**: server to client only (client uses POST for input)
- **Auto-reconnect**: `EventSource` reconnects automatically on disconnect, sending `Last-Event-ID` header
- **Text-based**: each event is `id: <N>\nevent: <type>\ndata: <json>\n\n`
- **Resumable**: sequential `id:` field enables reconnection without duplicate events

Every SSE event carries a monotonically increasing `id:` field (integer, per run, starting at 1). This is the standard SSE mechanism for reconnection: when `EventSource` reconnects, it sends a `Last-Event-ID` header with the last received ID. The server replays only events after that ID from its buffer.

```
id: 1
event: run_started
data: {"run_id": "...", "timestamp": "..."}

id: 2
event: node_started
data: {"node_id": "llm_1", "node_type": "llm", "timestamp": "..."}

id: 3
event: node_completed
data: {"node_id": "llm_1", "output": {"result": "..."},
       "state_snapshot": {"messages": [...], "result": "..."},
       "duration_ms": 342}

id: 4
event: edge_traversed
data: {"from": "llm_1", "to": "cond_1", "condition_result": "go_a"}

id: 5
event: graph_paused
data: {"node_id": "human_1", "prompt": "Enter your input",
       "run_id": "...", "input_key": "user_input"}

id: 6
event: graph_completed
data: {"final_state": {...}, "duration_ms": 1523}

id: 7
event: error
data: {"node_id": "web_search_1", "message": "Rate limit exceeded",
       "recoverable": true}

event: keepalive
data: {}
```

Note: `keepalive` events have no `id:` -- they are not meaningful for replay and should not advance the client's `Last-Event-ID`.

**Wire protocol updates needed**: `packages/shared/src/events.ts` must be updated to match these events. Specifically: add `node_type: string` to `node_started`, and add `input_key: string` to `graph_paused`. These are wire protocol types (not persisted) -- no migration needed, just a TypeScript type change.

### State Snapshot Approach

We use `stream_mode="updates"` (not combined `["updates", "values"]`). The `updates` mode gives us `{node_name: returned_dict}` after each node. For the full state snapshot, we call `graph.aget_state(config)` after each node completion.

**Why not `stream_mode=["updates", "values"]`**: Combined mode yields tuples of `("updates", {...})` and `("values", {...})` interleaved. Correlating which `values` event belongs to which `updates` event requires position tracking. Using `aget_state()` after each update is simpler, adds negligible overhead (reads from in-memory checkpointer), and gives us the exact same data.

### RunContext -- In-Memory State

```python
@dataclass
class RunContext:
    run_id: str
    graph_id: str
    owner_id: str
    queue: asyncio.Queue[dict | None]  # None = sentinel for stream end
    task: asyncio.Task | None
    cancel_event: asyncio.Event
    status: str                        # running | paused | completed | error
    started_at: float                  # time.monotonic()
    resume_event: asyncio.Event        # signaled when resume value is submitted
    resume_value: Any                  # the value to feed to Command(resume=...)
    compiled_graph: CompiledStateGraph
    config: dict                       # LangGraph config with thread_id
    events: list[dict]                 # buffered events for reconnection replay
    event_counter: int                 # monotonic counter for SSE id: field
    schema_dict: dict                  # original GraphSchema for condition routing
    total_pause_time: float            # accumulated seconds spent paused
```

The `RunManager` is a singleton attached to `app.state`. It holds no persistent data -- all persistence goes through the DB. If the server restarts, active runs are lost (acceptable for v1 -- the frontend detects this via the `/status` endpoint and shows "Run lost").

### Human-in-the-Loop Resume Protocol

The PROPOSAL describes a two-phase wait (wait for resume POST, then wait for SSE listener). We simplify this: since all events are buffered in `ctx.events` with sequential IDs, the SSE listener wait is unnecessary. If the frontend reconnects late, it uses `Last-Event-ID` to replay missed events. No events are lost.

```
1. Graph hits interrupt() in human_input node
2. Executor detects __interrupt__ in stream updates
3. Emits graph_paused SSE event
4. Updates DB: status="paused", paused_node_id, paused_prompt
5. Executor enters _wait_for_resume() loop (keepalive every 15s)

--- User submits input ---

6. POST /v1/runs/{id}/resume { input: "user's answer" }
7. Server stores resume_value on RunContext
8. Server sets resume_event
9. Returns 202 Accepted

--- Executor resumes immediately ---

10. _wait_for_resume() detects resume_event, returns
11. Executor feeds Command(resume=value) to graph.astream()
12. Execution continues, events buffered in ctx.events
13. Frontend reconnects to GET /stream with Last-Event-ID
14. Server replays only events after that ID, then streams live
```

**Why no SSE listener wait**: The event buffer with sequential IDs solves the problem more cleanly. The two-phase wait added complexity (extra asyncio.Event, timeout logic, notify_sse_connected coordination) for a problem that the buffered replay already handles.

**Server restart during resume**: If the server restarts between the resume POST and the frontend reconnecting, the run is lost. The `/status` endpoint returns DB state showing the last persisted status (likely "paused" or "running"). The frontend handles this as "Run lost." This is acceptable for v1 -- persistent checkpointer in Phase 5 addresses it.

### Reconnection Recovery

```
GET /v1/runs/{id}/status
  { status: "running",   run_id, graph_id }  -> client opens /stream
  { status: "paused",    run_id, graph_id, node_id, prompt }
  { status: "completed", run_id, graph_id, final_state, duration_ms }
  { status: "error",     run_id, graph_id, error }
  404 -> run not found or not owned by caller
```

When a client reconnects to `/stream`, it sends the `Last-Event-ID` header. The server replays only events from `RunContext.events` where `event_id > last_event_id`, then streams live. The live loop skips any event whose `id <= last_replayed_id` to avoid duplicates from the buffer/queue overlap.

### Cancellation

Each `RunContext` has a `cancel_event: asyncio.Event`. When set, the executor checks between node executions, breaks out of the loop, emits an error event, and updates the DB. For Phase 3, cancellation is triggered by the RunManager on timeout.

### Run Timeout

Every run has a 5-minute **execution time** timeout (excluding pause time). The timeout is tracked manually via cumulative execution time on `RunContext`:
- After each node completes, `_stream_graph` checks `execution_time >= timeout`
- `execution_time = time.monotonic() - started_at - total_pause_time`
- When entering `_wait_for_resume`, the pause start time is recorded
- When resuming, the pause duration is added to `total_pause_time`

This replaces `asyncio.wait_for` which would include pause time. Configurable via `RUN_TIMEOUT_SECONDS` env var (default: 300).

### Checkpointer Strategy

**Decision: `InMemorySaver` for Phase 3. Add `langgraph-checkpoint-sqlite` in Phase 5.**

`build_graph()` gains an optional `checkpointer` parameter. The executor creates a single `InMemorySaver` instance, passes it to `build_graph(schema, checkpointer=saver)`, and uses the same instance when calling `astream(config=...)`. The builder uses the provided checkpointer instead of creating its own -- this is critical because `aget_state()` must read from the same checkpointer that `astream()` writes to. Swapping to `AsyncSqliteSaver` later is a one-line change. Risk of losing paused runs on server restart is acceptable for v1 -- the `/status` endpoint returns DB state, and the frontend shows "Run lost."

### Concurrent Run Limit

**Decision: 3 concurrent runs per API key, 10 globally.**

`RunManager` checks both limits before launching. Returns 429 if exceeded. Configurable via `MAX_RUNS_PER_KEY` (default: 3) and `MAX_RUNS_GLOBAL` (default: 10).

---

## Engineering Decisions

| # | Approach (chosen) | Alternatives | Key tradeoff |
|---|-------------------|-------------|--------------|
| 1 | **Background asyncio.Task** | Inline in SSE response; Celery worker | Run survives SSE disconnect. Events buffered for replay. |
| 2 | **Manual StreamingResponse** | `sse-starlette` package | No extra dependency. Full control over format. |
| 3 | **`aget_state()` per node** | Combined stream_mode; values-only | Clean, explicit. No tuple correlation. Negligible overhead. |
| 4 | **Optional checkpointer param** | Always add checkpointer; Re-compile in executor | Additive, backward-compatible. Existing tests unaffected. |

---

## Files Summary

| Action | File | Part | Notes |
|--------|------|------|-------|
| **modify** | `app/builder.py` | 3.1 | Add optional `checkpointer` param |
| **rewrite** | `app/executor.py` | 3.2, 3.3 | RunContext, RunManager, execution, streaming |
| **create** | `app/schemas/runs.py` | 3.4 | Request/response models |
| **create** | `app/routes/runs.py` | 3.4 | GET stream, POST resume, GET status |
| **modify** | `app/routes/graphs.py` | 3.4 | Add POST /v1/graphs/{id}/run |
| **modify** | `app/main.py` | 3.4 | RunManager in lifespan, include router |
| **modify** | `app/schemas/__init__.py` | 3.4 | Export new schemas |
| **modify** | `tests/unit/test_builder.py` | 3.1 | 3 checkpointer tests |
| **create** | `tests/unit/test_executor.py` | 3.3 | 17 core execution tests |
| **create** | `tests/unit/test_executor_human.py` | 3.3 | 5 human-in-the-loop tests |
| **create** | `tests/unit/test_executor_reconnect.py` | 3.3 | 5 reconnection tests |
| **create** | `tests/unit/test_run_manager.py` | 3.2 | 8 RunManager tests |
| **create** | `tests/unit/test_routes_runs.py` | 3.4 | 19 route tests |

---

## Not in Scope

- **Remaining Phase 4 routes**: `/validate`, `/export`, run history listing, run deletion
- **Persistent checkpointer**: `langgraph-checkpoint-sqlite` (Phase 5)
- **Token-level streaming**: `stream_mode="messages"` for LLM token streaming (future)
- **WebSocket alternative**: SSE is sufficient for unidirectional streaming
- **Run history pagination**: Listing past runs with filters (Phase 4)
- **Frontend SSE hook**: The `runSlice.ts` and EventSource integration (frontend phase)
- **LLM retry/circuit-breaker**: Retry logic for transient LLM errors (Phase 5)
- **Custom httpx transport**: SSRF-safe DNS-pinning transport (Phase 5)
- **Multi-server run coordination**: Run state sharing across instances (not v1)

---

## Decisions & Risks

| Decision / Risk | Mitigation |
|-----------------|------------|
| In-memory RunManager loses state on server restart | DB has run status. Frontend `/status` endpoint detects lost runs. Persistent checkpointer in Phase 5. |
| `asyncio.Queue` can grow unbounded if SSE client disconnects | Queue has `maxsize=1000`. `_emit` catches `QueueFull`, logs warning. Event stays in `ctx.events` for replay. If the SSE client reads too slowly and the queue fills, live events are dropped but kept in `ctx.events`. Client should reconnect with `Last-Event-ID` to recover. |
| Reconnection replay could duplicate events | Sequential `id:` field. `stream_run_sse` replays only `id > last_event_id`. Live loop skips `id <= last_replayed_id`. |
| `aget_state()` after each node adds latency | Reads from `InMemorySaver` -- effectively a dict lookup. <1ms. |
| `default=str` in `json.dumps` silently converts unknown types | Better than crashing the stream. |
| Background task leak if exception in finally block | `RunManager.cleanup_run()` is idempotent. Timeout also cleans up. |
| DB calls in exception handlers can fail | `_safe_update_run()` catches and logs. `_emit()` called before DB update. |
| Resume after pause: frontend might miss events | Events buffered with sequential IDs. Frontend replays via `Last-Event-ID`. |
| `condition_result` in edge_traversed | After each `node_completed`, look up outgoing edges from `schema_dict["edges"]` where `source == completed_node_id`. For non-condition nodes, emit `edge_traversed` with `condition_result: null`. For condition nodes, wait until the next update to see which node actually executes, then emit `edge_traversed` retroactively with the branch name that maps to that target in the condition's `branches` config. |
| Concurrent limit too low for power users | Configurable via env vars (3/key, 10/global). |
| Run timeout kills long-running graphs | 5-min default, configurable. Excludes pause time. |
| `StreamingResponse` doesn't detect disconnect immediately | Keepalive every 15s ensures detection within 15s. |
| Modifying `build_graph()` signature | Additive (optional kwarg). All existing tests pass. |
| `tool_node` is sync but executor is async | LangGraph handles thread pool execution for sync node functions. |
| `gw-execution` skill doc has stale route URLs | Todolist includes updating after implementation. |

---

## Verification

```bash
cd packages/execution
uv run ruff check app/ tests/
uv run ruff format --check app/ tests/
uv run pytest tests/unit/ -v
```

Manual testing:

```bash
# 1. Bootstrap admin key (if not already done)
uv run python -m app.cli create-key --name admin --scopes all

# 2. Start server
pnpm dev:exec

# 3. Create a graph with a simple schema (start -> llm -> end)
curl -X POST localhost:8000/v1/graphs \
  -H "X-API-Key: gw_<key>" \
  -H "Content-Type: application/json" \
  -d '{"name": "Test", "schema_json": { <valid schema> }}'

# 4. Start a run
curl -X POST localhost:8000/v1/graphs/<graph-id>/run \
  -H "X-API-Key: gw_<key>" \
  -H "Content-Type: application/json" \
  -d '{"input": {"messages": [["human", "Hello"]]}}'

# 5. Stream SSE events
curl -N localhost:8000/v1/runs/<run-id>/stream \
  -H "X-API-Key: gw_<key>"

# 6. Check status
curl localhost:8000/v1/runs/<run-id>/status \
  -H "X-API-Key: gw_<key>"
```
