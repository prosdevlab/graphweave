---
name: gw-execution
description: "FastAPI routes, LangGraph builder (GraphSchema to StateGraph), SSE streaming, tool registry pattern, human-in-the-loop resume server logic, graph validation endpoint, run history storage, export/code generation, and migration runner. Load when working on FastAPI routes, LangGraph builder, SSE streaming, tool registry, validation, run history, export generation, or migrations."
disable-model-invocation: true
---

# Skill: Execution

Load this when: working on FastAPI routes, LangGraph builder, SSE streaming,
tool registry, export generation, or migrations.
Also load schema.md — the execution layer consumes GraphSchema.

---

## Package structure

```
packages/execution/
├── app/
│   ├── main.py          # FastAPI app, CORS, rate limiting, startup validation
│   ├── builder.py       # GraphSchema → LangGraph StateGraph
│   ├── executor.py      # run management, SSE streaming, reconnection
│   ├── exporter.py      # Python code generation + compile validation
│   ├── logging.py       # structured JSON logging config
│   ├── tools/           # built-in tool registry
│   │   ├── registry.py  # tool lookup by name
│   │   ├── web_search.py
│   │   ├── url_fetch.py
│   │   ├── wikipedia.py
│   │   ├── file_read.py
│   │   ├── file_write.py
│   │   ├── calculator.py
│   │   ├── datetime_tool.py
│   │   └── weather.py
│   └── db/
│       ├── models.py
│       └── migrations/
│           ├── 001_initial.py
│           └── 002_add_run_history.py
├── .env.example
├── pyproject.toml       # uv manages deps — never edit manually without uv add
└── uv.lock              # committed — uv sync --frozen in CI + Docker
```

## API routes

```
POST   /graphs                     create graph
GET    /graphs                     list graphs
GET    /graphs/{id}                get graph
PUT    /graphs/{id}                update graph
DELETE /graphs/{id}                delete graph

POST   /graphs/{id}/run            start run → { run_id }
GET    /graphs/run/{id}/stream     SSE stream
GET    /graphs/run/{id}/status     reconnection recovery endpoint
POST   /graphs/run/{id}/resume     human-in-the-loop resume
POST   /graphs/{id}/validate       client-side pre-run validation
GET    /graphs/{id}/export         generate Python + requirements.txt

GET    /settings/providers         provider status — never returns key values
```

## builder.py — GraphSchema → StateGraph

```python
def build_graph(schema: GraphSchema, llm_provider: str) -> CompiledGraph:
    # 1. Build TypedDict state class from schema.state
    # 2. Create StateGraph(State)
    # 3. Add nodes by type (llm, tool, condition, human_input)
    # 4. Add edges (unconditional + conditional)
    # 5. Set entry point from Start node
    # 6. compile() with checkpointer for human-in-the-loop

    # Compile-only validation (no invocation):
    try:
        compiled = graph.compile(checkpointer=MemorySaver())
        return compiled
    except Exception as e:
        raise GraphBuildError(f"Graph compilation failed: {e}",
                              node_ref=extract_node_ref(e))
```

## executor.py — SSE streaming

```python
async def stream_run(run_id: str, graph: CompiledGraph,
                     input: dict) -> AsyncGenerator[str, None]:
    async for event in graph.astream(input, config={"run_id": run_id}):
        node_id = list(event.keys())[0]
        yield format_sse("node_completed", {
            "node_id": node_id,
            "output": event[node_id],
            "state_snapshot": get_state_snapshot(graph, run_id),
            "duration_ms": ...,
        })
    yield format_sse("graph_completed", { "final_state": ... })

def format_sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"
```

## /status endpoint — reconnection recovery

```python
@app.get("/graphs/run/{run_id}/status")
async def get_run_status(run_id: str):
    run = db.get_run(run_id)
    return {
        "status": run.status,          # running | completed | paused | error
        "final_state": run.final_state if run.status == "completed" else None,
        "paused_node_id": run.paused_node_id if run.status == "paused" else None,
        "paused_prompt": run.paused_prompt if run.status == "paused" else None,
    }
```

## Tool registry pattern

```python
# Every tool must conform to this interface
class BaseTool:
    name: str
    description: str

    def run(self, inputs: dict) -> dict:
        # Always return the response envelope:
        # { "success": True/False, "result": ..., "source": ...,
        #   "truncated": False, "recoverable": True/False }
        raise NotImplementedError

# registry.py
REGISTRY: dict[str, BaseTool] = {
    "web_search":    WebSearchTool(),
    "url_fetch":     UrlFetchTool(),
    "wikipedia":     WikipediaTool(),
    "file_read":     FileReadTool(),
    "file_write":    FileWriteTool(),
    "calculator":    CalculatorTool(),
    "datetime":      DatetimeTool(),
    "weather":       WeatherTool(),
}

def get_tool(name: str) -> BaseTool:
    if name not in REGISTRY:
        raise ToolNotFoundError(f"Unknown tool: {name}")
    return REGISTRY[name]
```

## Human-in-the-loop resume (server side)

```python
@app.post("/graphs/run/{run_id}/resume")
async def resume_run(run_id: str, body: ResumeBody):
    # Mark as resume_pending — do NOT continue execution yet
    db.update_run_status(run_id, "resume_pending", input=body.input)
    return { "success": True, "run_id": run_id }

# executor.py — detects SSE connection then continues
async def wait_for_sse_then_resume(run_id: str):
    deadline = time.time() + 2.0   # 2-second timeout
    while time.time() < deadline:
        if sse_connections.get(run_id):
            break
        await asyncio.sleep(0.1)
    # Continue regardless — events stored in run history either way
    await continue_execution(run_id)
```

## Graph validation endpoint

```python
@app.post("/graphs/{id}/validate")
async def validate_graph(id: str):
    schema = db.get_graph(id)
    errors = []

    # Structural checks
    if not has_start_node(schema):
        errors.append({"type": "missing_start", "message": "Graph must have a Start node"})
    if not has_end_node(schema):
        errors.append({"type": "missing_end", "message": "Graph must have an End node"})
    if orphans := find_orphan_nodes(schema):
        errors.append({"type": "orphan_nodes", "node_ids": orphans,
                        "message": "Disconnected nodes found"})

    # Compilation check — catches edge reference errors, invalid conditions
    if not errors:
        try:
            build_graph(schema, provider="openai")  # no API call, compile only
        except GraphBuildError as e:
            errors.append({"type": "build_error", "node_id": e.node_ref,
                            "message": str(e)})

    return {"valid": len(errors) == 0, "errors": errors}
```

Client-side validation catches obvious issues fast. This endpoint catches
structural compilation errors that only `build_graph()` can detect.

## Run history

Last 10 runs per graph, stored in SQLite. Accessed via the run history tab
in the run panel.

```python
# db/models.py
class Run:
    id: str              # uuid
    graph_id: str
    status: str          # running | completed | paused | error
    input: dict
    final_state: dict | None
    duration_ms: int | None
    created_at: str      # ISO 8601
    error: str | None
    paused_node_id: str | None
    paused_prompt: str | None

@app.get("/graphs/{id}/runs")
async def list_runs(id: str, limit: int = 10):
    return db.get_runs_by_graph(id, limit=limit)
    # Returns: [{ id, status, input, final_state, duration_ms, created_at }]
```

Run events are stored as the run progresses so that reconnection and
history replay can reconstruct the full trace.

## Export quality

```python
# exporter.py — two-layer validation before generating files

# Layer 1 (v1): compile-only — no invocation
def validate_export(schema: GraphSchema) -> ValidationResult:
    try:
        graph = build_graph(schema, provider="openai")  # no API call
        return ValidationResult(valid=True)
    except GraphBuildError as e:
        return ValidationResult(valid=False, error=str(e), node_ref=e.node_ref)

# Layer 2 (v1.1): dry-run with synthetic input (opt-in)
# Generated code annotates every user action with # TODO comments
```
