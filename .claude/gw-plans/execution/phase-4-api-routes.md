# Phase 4: API Routes (Validate, Export, Run History, Cancel, Delete)

**Updated**: 2026-03-14

## Context

The execution layer has a DB layer with tools and state utils (Phase 1), scoped API key auth with CRUD routes (Phase 1.5), the GraphSchema-to-LangGraph builder with `validate_schema()` and `build_graph()` (Phase 2), and the executor with SSE streaming, run management, and four routes (Phase 3).

Phase 3 delivered the minimum routes to make the executor demoable end-to-end:

```
POST   /v1/graphs/{id}/run        start execution
GET    /v1/runs/{id}/stream       SSE event stream
POST   /v1/runs/{id}/resume       human-in-the-loop resume
GET    /v1/runs/{id}/status       reconnection recovery
```

Phase 4 completes the API surface that the canvas frontend needs. Every route here is independently useful -- the frontend can wire up buttons and panels as each lands.

---

## What Phase 4 Delivers

1. **Schema validation endpoint** -- pre-run validation without executing the graph
2. **Export endpoint** -- returns 501 stub (actual code generation is Phase 5)
3. **Run history** -- paginated listing of past runs, per graph or globally
4. **Run cancellation** -- stop a running/paused graph via HTTP
5. **Run deletion** -- clean up old runs from the database

These fill the gaps between "executor works" (Phase 3) and "frontend has everything it needs to build the run panel, history tab, and export button."

---

## Feature Inventory

### New Routes

| # | Method | Path | Scope | Status Code | Summary |
|---|--------|------|-------|-------------|---------|
| R1 | `POST` | `/v1/graphs/{id}/validate` | `graphs:read` | 200 / 422 | Validate GraphSchema without executing |
| R2 | `GET` | `/v1/graphs/{id}/export` | `graphs:read` | 501 | Export stub (Phase 5 implements) |
| R3 | `GET` | `/v1/graphs/{id}/runs` | `runs:read` | 200 | List runs for a specific graph (paginated) |
| R4 | `GET` | `/v1/runs` | `runs:read` | 200 | List all runs for the authenticated owner (paginated) |
| R5 | `POST` | `/v1/runs/{id}/cancel` | `runs:write` | 202 / 409 | Cancel a running or paused run |
| R6 | `DELETE` | `/v1/runs/{id}` | `runs:write` | 204 / 409 | Delete a completed/error run |

### Route Details

#### R1: Validate Graph Schema

```
POST /v1/graphs/{id}/validate
Scope: graphs:read
Body: (none -- validates the graph's stored schema)
Response 200: ValidateResponse { valid: true, errors: [] }
Response 422: ValidateResponse { valid: false, errors: [...] }
```

This calls the existing `validate_schema()` from `app/builder.py` and also attempts `build_graph()` to catch compilation errors. The difference from `POST /v1/graphs/{id}/run` is that no run is created and no execution happens.

**Why POST, not GET**: Validation is an action with side effects on the response shape (it does work -- parsing, compilation). GET with no body is semantically awkward for "please validate this." The `gw-api-design` skill lists actions as sub-resources, which aligns with `POST .../validate`.

Response body:

```python
class ValidationError(BaseModel):
    message: str
    node_ref: str | None = None  # which node caused the error, if applicable

class ValidateResponse(BaseModel):
    valid: bool
    errors: list[ValidationError]
```

Status code rationale: 200 when valid. Also 200 when invalid -- the validation *succeeded* in finding errors. The `valid: false` field communicates the result. This follows the pattern of validation endpoints that report findings rather than failing. However, if the graph itself doesn't exist, return 404.

**Update (after review)**: Using 422 when invalid is more consistent with how the rest of the API handles validation failures. The route returns 200 when valid, 422 when invalid with the errors list in the response body. This matches the existing pattern where `POST /v1/graphs/{id}/run` returns 422 for schema build errors.

#### R2: Export Graph

```
GET /v1/graphs/{id}/export
Scope: graphs:read
Response 501: { detail: "Export not implemented", status_code: 501 }
```

Returns 501 Not Implemented. The `exporter.py` stub exists but does not produce useful output yet. Phase 5 implements the actual code generation.

The 501 response uses the standard error envelope (`{detail, status_code}`) so the frontend can detect it and show "Export coming soon" rather than treating it as an unexpected error.

#### R3: List Runs for Graph

```
GET /v1/graphs/{id}/runs?limit=20&offset=0&status=completed
Scope: runs:read
Response 200: PaginatedResponse { items: [RunListItem], total, limit, offset, has_more }
```

Returns paginated run history for a specific graph. The existing `list_runs_by_graph` in `crud.py` needs to be upgraded to support full pagination (offset + total count) and optional status filtering.

Query parameters:

| Param | Type | Default | Constraints |
|-------|------|---------|-------------|
| `limit` | int | 20 | 1-100 |
| `offset` | int | 0 | >= 0 |
| `status` | str \| None | None | One of: running, paused, completed, error |

Response item shape (intentionally lighter than `RunStatusResponse` -- no `final_state` blob in list views):

```python
class RunListItem(BaseModel):
    id: str
    graph_id: str
    status: str
    input: dict
    duration_ms: int | None = None
    created_at: str
    error: str | None = None
```

Note: `final_state` is excluded from list items. It can be large (full message history) and would bloat paginated responses. Clients fetch it via `GET /v1/runs/{id}/status` for individual runs.

#### R4: List All Runs

```
GET /v1/runs?limit=20&offset=0&status=completed&graph_id=<uuid>
Scope: runs:read
Response 200: PaginatedResponse { items: [RunListItem], total, limit, offset, has_more }
```

Returns paginated run history across all graphs for the authenticated owner. Admin keys see all runs.

Additional query parameter beyond R3:

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `graph_id` | str \| None | None | Filter to a specific graph |

This overlaps with R3 but serves a different use case: the frontend's global run history panel vs. a per-graph run tab. R3 also verifies graph ownership (404 if graph not found).

#### R5: Cancel Run

```
POST /v1/runs/{id}/cancel
Scope: runs:write
Body: (none)
Response 200: { status: "cancelled" }
Response 404: Run not found
Response 409: Run is not running or paused (already completed/error)
```

Calls the existing `RunManager.cancel_run()`. The executor's `_stream_graph` loop checks `cancel_event.is_set()` between nodes and emits an error SSE event. Cancellation is asynchronous — the response confirms the request was received, not that the run has stopped. The run's eventual DB status will be `status="error", error="Cancelled"`. There is no "cancelled" status in the system.

If the run exists in the DB but not in `RunManager` (server restarted), and its DB status is still "running" or "paused", the route updates the DB status to "error" with error="Cancelled (server lost run)" and returns 202. This prevents stale "running" records. Uses `owner_id=_owner_filter(auth)` so admin keys can cancel stale runs belonging to other users.

#### R6: Delete Run

```
DELETE /v1/runs/{id}
Scope: runs:write
Response 204: (empty body)
Response 404: Run not found
Response 409: Run is still active (running or paused)
```

Deletes a run from the database. Only completed or error runs can be deleted -- active runs must be cancelled first. This prevents orphaning a running executor task.

---

## DB Changes

### New CRUD functions in `app/db/crud.py`

1. **`list_runs`** -- paginated listing across all graphs with optional `graph_id` and `status` filters. Returns `(list[Run], total_count)`.
2. **`delete_run`** -- delete a run by ID with owner_id filtering. Returns `bool`.
3. **Upgrade `list_runs_by_graph`** -- add `offset` parameter and return `(list[Run], total_count)` tuple (currently returns `list[Run]` only). Add optional `status` filter.

### No new migrations

No schema changes needed. The existing `runs` table has all required columns. The new queries use existing columns (`status`, `graph_id`, `owner_id`).

### New index (performance, additive)

Add a composite index on `runs(graph_id, owner_id, status)` to support filtered run history queries. This is additive and can be done in a migration or inline. Since the DB is SQLite and pre-production, we can add it in migration `003_run_indexes.py` to follow the established pattern.

---

## Parts

| Part | Commit | Summary |
|------|--------|---------|
| 4.1 | 1 | CRUD upgrades + migration: `list_runs`, `delete_run`, upgrade `list_runs_by_graph` |
| 4.2 | 2 | Pydantic schemas + validate/export routes on graphs router |
| 4.3 | 3 | Run history, cancel, delete routes on runs router |

---

## Part 4.1: CRUD Upgrades + Migration

### Summary

Upgrade `list_runs_by_graph` to support pagination and status filtering. Add `list_runs` for cross-graph listing. Add `delete_run`. Add migration `003_run_indexes.py`.

### Implementation

#### Migration `003_run_indexes.py`

```python
"""Run query indexes for Phase 4 run history."""

VERSION = 3

def up(db) -> None:
    db.execute(
        "CREATE INDEX IF NOT EXISTS idx_runs_graph_owner_status "
        "ON runs(graph_id, owner_id, status)"
    )
    db.execute(
        "CREATE INDEX IF NOT EXISTS idx_runs_owner_status "
        "ON runs(owner_id, status)"
    )
    db.execute(
        "CREATE INDEX IF NOT EXISTS idx_runs_created "
        "ON runs(created_at)"
    )
```

#### Upgraded `list_runs_by_graph`

```python
async def list_runs_by_graph(
    db: aiosqlite.Connection,
    graph_id: str,
    owner_id: str | None = None,
    status: str | None = None,
    limit: int = 20,
    offset: int = 0,
) -> tuple[list[Run], int]:
```

Breaking change to return type (was `list[Run]`). Must update all callers -- the existing `test_list_runs_by_graph` in `tests/unit/test_crud.py` must be updated to destructure the tuple: `runs, total = await list_runs_by_graph(...)`.

#### New `list_runs`

```python
async def list_runs(
    db: aiosqlite.Connection,
    owner_id: str | None = None,
    graph_id: str | None = None,
    status: str | None = None,
    limit: int = 20,
    offset: int = 0,
) -> tuple[list[Run], int]:
```

#### New `delete_run`

```python
async def delete_run(
    db: aiosqlite.Connection,
    run_id: str,
    owner_id: str | None = None,
) -> bool:
```

Returns `True` if a row was deleted, `False` if not found (or wrong owner).

### Files

| Action | File |
|--------|------|
| **create** | `app/db/migrations/003_run_indexes.py` |
| **modify** | `app/db/crud.py` |
| **modify** | `tests/unit/test_crud.py` |

### Tests (9) -- in `tests/unit/test_crud.py`

1. **test_list_runs_by_graph_paginated**: Create 5 runs, list with limit=2 offset=0. Verify 2 items, total=5, ordered by created_at DESC.
2. **test_list_runs_by_graph_offset**: Create 5 runs, list with limit=2 offset=2. Verify correct 2 items.
3. **test_list_runs_by_graph_status_filter**: Create runs with mixed statuses. Filter by status="completed". Verify only completed runs returned, total reflects filter.
4. **test_list_runs_by_graph_owner_isolation**: Create runs for two owners. List for owner A. Verify only owner A's runs returned.
5. **test_list_runs_all_graphs**: Create runs across 2 graphs. Call `list_runs(owner_id=...)`. Verify all runs for that owner returned.
6. **test_list_runs_graph_id_filter**: Create runs across 2 graphs. Call `list_runs(graph_id=...)`. Verify only runs for that graph returned.
7. **test_list_runs_status_filter**: Create runs with mixed statuses. Call `list_runs(status="error")`. Verify only error runs returned.
8. **test_delete_run_success**: Create a run, delete it. Verify returns True. Verify `get_run` returns None.
9. **test_delete_run_wrong_owner**: Create a run for owner A, attempt delete as owner B. Verify returns False. Verify run still exists.

### Commit

```
feat: add paginated run listing and run deletion to CRUD layer

Upgrade list_runs_by_graph with offset/total/status filter.
Add list_runs for cross-graph queries. Add delete_run.
Add migration 003 with composite indexes for run history queries.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
```

### Detailed Todolist

#### Migration

- [ ] Create `app/db/migrations/003_run_indexes.py`
- [ ] Set `VERSION = 3`
- [ ] Implement `up(db)`: create three indexes -- `idx_runs_graph_owner_status` on `(graph_id, owner_id, status)`, `idx_runs_owner_status` on `(owner_id, status)`, `idx_runs_created` on `(created_at)`. Use `CREATE INDEX IF NOT EXISTS`.

#### CRUD upgrades

- [ ] Open `app/db/crud.py`
- [ ] Modify `list_runs_by_graph` signature: add `status: str | None = None`, add `offset: int = 0`, change return type to `tuple[list[Run], int]`
- [ ] Implement pagination: add `OFFSET ?` to the query, add count query mirroring the filter conditions
- [ ] Implement status filter: when `status is not None`, add `AND status = ?` to both count and data queries
- [ ] Return `(runs, total)` tuple
- [ ] Add new function `list_runs(db, owner_id, graph_id, status, limit, offset)` returning `tuple[list[Run], int]`:
  - Build WHERE clauses dynamically based on which filters are provided
  - `owner_id is not None` -> `AND owner_id = ?`
  - `graph_id is not None` -> `AND graph_id = ?`
  - `status is not None` -> `AND status = ?`
  - Count query with same filters
  - `ORDER BY created_at DESC LIMIT ? OFFSET ?`
- [ ] Add new function `delete_run(db, run_id, owner_id)` returning `bool`:
  - If `owner_id is not None`: `DELETE FROM runs WHERE id = ? AND owner_id = ?`
  - Else: `DELETE FROM runs WHERE id = ?`
  - `await db.commit()`
  - Return `cursor.rowcount > 0`

#### Tests

- [ ] Open `tests/unit/test_crud.py`
- [ ] Add helper to create multiple test runs with varying statuses, graph_ids, and owner_ids
- [ ] Add `test_list_runs_by_graph_paginated`
- [ ] Add `test_list_runs_by_graph_offset`
- [ ] Add `test_list_runs_by_graph_status_filter`
- [ ] Add `test_list_runs_by_graph_owner_isolation`
- [ ] Add `test_list_runs_all_graphs`
- [ ] Add `test_list_runs_graph_id_filter`
- [ ] Add `test_list_runs_status_filter`
- [ ] Add `test_delete_run_success`
- [ ] Add `test_delete_run_wrong_owner`
- [ ] Run `uv run ruff check app/db/crud.py app/db/migrations/ tests/unit/test_crud.py`
- [ ] Run `uv run pytest tests/unit/test_crud.py -v`

---

## Part 4.2: Validate and Export Routes

### Summary

Add Pydantic schemas for validation and export responses. Add `POST /v1/graphs/{id}/validate` and `GET /v1/graphs/{id}/export` to the existing graphs router.

### Pydantic Schemas -- `app/schemas/graphs.py` (add to existing file)

```python
class SchemaValidationError(BaseModel):
    """A single validation error from schema checking."""
    message: str = Field(description="Human-readable error description.")
    node_ref: str | None = Field(
        default=None,
        description="Node ID that caused the error, if applicable.",
    )

class ValidateResponse(BaseModel):
    """Result of schema validation."""
    valid: bool = Field(description="True if the schema is valid.")
    errors: list[SchemaValidationError] = Field(
        default_factory=list,
        description="List of validation errors (empty when valid).",
    )

class ExportResponse(BaseModel):
    """Exported Python code and requirements."""
    code: str = Field(description="Generated Python source code.")
    requirements: str = Field(description="requirements.txt content.")
```

### Routes -- added to `app/routes/graphs.py`

#### Validate

```
POST /v1/graphs/{id}/validate
Scope: graphs:read
Response 200: ValidateResponse { valid: true, errors: [] }
Response 422: ValidateResponse { valid: false, errors: [...] }
Response 404: Graph not found
```

Flow:
1. Fetch graph from DB (404 if not found / not owned)
2. Call `validate_schema(graph.schema_json)` (from `app/builder.py`)
3. If `GraphBuildError` is raised, return 422 with `ValidateResponse(valid=False, errors=[...])`
4. Attempt `build_graph(graph.schema_json, llm_override=FakeListChatModel(responses=[""]))` to catch compilation errors beyond structural validation. The mock LLM avoids 500 errors when LLM provider API keys are not configured — validation checks structure, not runtime readiness.
5. If `GraphBuildError` is raised, return 422 with `ValidateResponse(valid=False, errors=[...])`
6. If any other `Exception` is raised (e.g., unexpected compilation failure), return 422 with the exception message.
7. Return 200 with `ValidateResponse(valid=True, errors=[])`

Note: `validate_schema` raises `GraphBuildError` with a `node_ref` attribute. We capture this to populate `SchemaValidationError.node_ref`. Unreachable nodes produce a `logger.warning` only, not an error — this is intentional (max-step limit is the runtime safety net).

#### Export

```
GET /v1/graphs/{id}/export
Scope: graphs:read
Response 501: { detail: "Export not implemented. Coming in a future release.", status_code: 501 }
Response 404: Graph not found
```

Flow:
1. Fetch graph from DB (404 if not found / not owned)
2. Raise HTTPException(status_code=501, detail="Export not implemented. Coming in a future release.")

We verify the graph exists before returning 501 so the frontend doesn't confuse "graph not found" with "export not ready."

### Files

| Action | File |
|--------|------|
| **modify** | `app/schemas/graphs.py` |
| **modify** | `app/routes/graphs.py` |
| **modify** | `tests/unit/test_routes.py` |

### Tests (7) -- in `tests/unit/test_routes.py`

1. **test_validate_valid_schema**: Create graph with valid schema. POST /validate. Verify 200, `valid: true`, empty errors.
2. **test_validate_invalid_schema_missing_start**: Create graph with schema missing start node. POST /validate. Verify 422, `valid: false`, errors list non-empty with relevant message.
3. **test_validate_invalid_schema_unknown_tool**: Create graph with a tool node referencing a nonexistent tool. POST /validate. Verify 422, errors include `node_ref` pointing to the tool node.
4. **test_validate_graph_not_found**: POST /validate with nonexistent graph_id. Verify 404.
5. **test_validate_wrong_owner**: Create graph with key A. POST /validate with key B. Verify 404.
6. **test_export_returns_501**: Create graph. GET /export. Verify 501 with detail message.
7. **test_export_graph_not_found**: GET /export with nonexistent graph_id. Verify 404.

### Commit

```
feat: add schema validation and export stub routes

POST /v1/graphs/{id}/validate checks schema without executing.
Returns 200 with valid:true or 422 with error details and node refs.
GET /v1/graphs/{id}/export returns 501 until Phase 5.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
```

### Detailed Todolist

#### Pydantic schemas

- [ ] Open `app/schemas/graphs.py`
- [ ] Add `SchemaValidationError(BaseModel)`: `message: str`, `node_ref: str | None = None`, with Field descriptions
- [ ] Add `ValidateResponse(BaseModel)`: `valid: bool`, `errors: list[SchemaValidationError]` with `default_factory=list`, with Field descriptions
- [ ] Add `ExportResponse(BaseModel)`: `code: str`, `requirements: str`, with Field descriptions (used in Phase 5, defined now for OpenAPI docs)

#### Routes

- [ ] Open `app/routes/graphs.py`
- [ ] Add imports: `validate_schema` from `app.builder` (currently only `build_graph` and `GraphBuildError` are imported)
- [ ] Add imports: `ValidateResponse`, `SchemaValidationError` from `app.schemas.graphs`
- [ ] Implement `POST /{graph_id}/validate`:
  - Scope: `graphs:read` (validation is a read operation -- does not mutate)
  - Fetch graph from DB with owner_id filtering -> 404 if not found
  - Try `validate_schema(graph.schema_json)` -- catch `GraphBuildError` as `exc`
  - On error: return `JSONResponse(status_code=422, content=ValidateResponse(valid=False, errors=[SchemaValidationError(message=str(exc), node_ref=exc.node_ref)]).model_dump())`
  - Try `build_graph(graph.schema_json, llm_override=FakeListChatModel(responses=[""]))` -- catch `GraphBuildError` as `exc`
  - On error: same 422 response
  - Catch any other `Exception` as `exc`: same 422 response with `message=str(exc)`
  - On success: return 200 `ValidateResponse(valid=True, errors=[])`
  - Set `response_model=ValidateResponse` on the decorator
- [ ] Implement `GET /{graph_id}/export`:
  - Scope: `graphs:read`
  - Fetch graph from DB with owner_id filtering -> 404 if not found
  - Raise `HTTPException(status_code=501, detail="Export not implemented. Coming in a future release.")`

#### Tests

- [ ] Open `tests/unit/test_routes.py`
- [ ] Add `test_validate_valid_schema`: create graph with valid start -> llm -> end schema. POST `/v1/graphs/{id}/validate`. Assert 200. Assert response body `valid == True` and `errors == []`.
- [ ] Add `test_validate_invalid_schema_missing_start`: create graph with schema that has no start node (e.g. only an LLM and end node). POST `/v1/graphs/{id}/validate`. Assert 422. Assert `valid == False`. Assert `errors` list has at least one entry with a non-empty `message`.
- [ ] Add `test_validate_invalid_schema_unknown_tool`: create graph with a tool node referencing a nonexistent tool (e.g., `tool_name: "does_not_exist"`). POST validate. Assert 422. Assert errors include a `node_ref` field pointing to the tool node ID.
- [ ] Add `test_validate_graph_not_found`: POST `/v1/graphs/nonexistent-id/validate`. Assert 404.
- [ ] Add `test_validate_wrong_owner`: create graph with key A, POST validate with key B. Assert 404.
- [ ] Add `test_export_returns_501`: create graph, GET `/v1/graphs/{id}/export`. Assert 501. Assert response body has `detail` containing "not implemented".
- [ ] Add `test_export_graph_not_found`: GET `/v1/graphs/nonexistent-id/export`. Assert 404.
- [ ] Run `uv run ruff check app/schemas/graphs.py app/routes/graphs.py tests/unit/test_routes.py`
- [ ] Run `uv run pytest tests/unit/test_routes.py -v`

---

## Part 4.3: Run History, Cancel, and Delete Routes

### Summary

Add `GET /v1/graphs/{id}/runs` and `GET /v1/runs` for paginated run history. Add `POST /v1/runs/{id}/cancel` and `DELETE /v1/runs/{id}` to the existing runs router.

### Pydantic Schemas -- `app/schemas/runs.py` (add to existing file)

```python
class RunListItem(BaseModel):
    """Lightweight run representation for list endpoints."""
    id: str
    graph_id: str
    status: str
    input: dict = Field(default_factory=dict)
    duration_ms: int | None = None
    created_at: str
    error: str | None = None
```

### Routes

#### R3: List Runs for Graph -- `app/routes/graphs.py`

```
GET /v1/graphs/{graph_id}/runs?limit=20&offset=0&status=completed
Scope: runs:read
Response 200: PaginatedResponse { items: [RunListItem], ... }
Response 404: Graph not found
```

Flow:
1. Fetch graph from DB (404 if not found / not owned) -- verifies graph ownership
2. Call `list_runs_by_graph(db, graph_id, owner_id, status, limit, offset)`
3. Return `PaginatedResponse` with `RunListItem` items

This route lives on the graphs router because it's scoped to a graph resource (`/v1/graphs/{id}/runs`).

#### R4: List All Runs -- `app/routes/runs.py`

```
GET /v1/runs?limit=20&offset=0&status=completed&graph_id=<uuid>
Scope: runs:read
Response 200: PaginatedResponse { items: [RunListItem], ... }
```

Flow:
1. Call `list_runs(db, owner_id, graph_id, status, limit, offset)`
2. Return `PaginatedResponse` with `RunListItem` items

Admin keys see all runs (`owner_id=None`).

#### R5: Cancel Run -- `app/routes/runs.py`

```
POST /v1/runs/{run_id}/cancel
Scope: runs:write
Body: (none)
Response 202: { detail: "Cancel requested" }
Response 404: Run not found
Response 409: Run is not cancellable (already completed/error)
```

Flow:
1. Check RunManager for live run. Verify ownership (404 if wrong owner, unless admin).
2. If in RunManager and status in ("running", "paused"): call `run_manager.cancel_run(run_id)`, return 202 `{"detail": "Cancel requested"}`.
3. If in RunManager but status is completed/error: return 409.
4. If not in RunManager: check DB with `owner_id=_owner_filter(auth)` (None for admin).
   - Not found: 404.
   - Status is "running" or "paused" (stale -- server restarted): update DB to status="error", error="Cancelled (server lost run)". Return 202.
   - Status is completed/error: return 409.

#### R6: Delete Run -- `app/routes/runs.py`

```
DELETE /v1/runs/{run_id}
Scope: runs:write
Response 204: (empty body)
Response 404: Run not found
Response 409: Run is still active
```

Flow:
1. Check RunManager -- if run is active (running/paused), return 409 "Cannot delete an active run. Cancel it first."
2. Check DB -- `get_run(db, run_id, owner_id)`.
   - Not found: 404.
   - Status is "running" or "paused": 409 (defensive -- RunManager check should have caught live runs, but DB might have stale status).
   - Status is "completed" or "error": call `delete_run(db, run_id, owner_id)`, return 204.

### Files

| Action | File |
|--------|------|
| **modify** | `app/schemas/runs.py` |
| **modify** | `app/schemas/__init__.py` |
| **modify** | `app/routes/graphs.py` |
| **modify** | `app/routes/runs.py` |
| **create** | `tests/unit/test_routes_phase4.py` |

### Tests (14) -- `tests/unit/test_routes_phase4.py`

Separate test file to avoid bloating the existing `test_routes_runs.py` (19 tests from Phase 3).

**Run history:**
1. **test_list_runs_for_graph_empty**: Create graph with no runs. GET `/v1/graphs/{id}/runs`. Verify 200, items=[], total=0.
2. **test_list_runs_for_graph_paginated**: Create graph with 5 runs. GET with limit=2. Verify 2 items, total=5, has_more=True.
3. **test_list_runs_for_graph_status_filter**: Create graph with mixed-status runs. GET with `?status=completed`. Verify only completed runs.
4. **test_list_runs_for_graph_not_found**: GET `/v1/graphs/nonexistent/runs`. Verify 404.
5. **test_list_runs_for_graph_wrong_owner**: Create graph with key A. GET runs with key B. Verify 404.
6. **test_list_all_runs**: Create runs across 2 graphs. GET `/v1/runs`. Verify all runs for owner returned.
7. **test_list_all_runs_graph_id_filter**: GET `/v1/runs?graph_id=<uuid>`. Verify only runs for that graph.
8. **test_list_all_runs_excludes_other_owners**: Create runs for owner A and B. GET `/v1/runs` as owner A. Verify only A's runs.

**Cancel:**
9. **test_cancel_running_run**: Start a run, POST cancel. Verify 202, response contains "Cancel requested".
10. **test_cancel_already_completed**: Start run, wait for completion, POST cancel. Verify 409.
11. **test_cancel_stale_db_run**: Insert run in DB with status="running" (not in RunManager). POST cancel. Verify 202, DB status updated to "error".
12. **test_cancel_not_found**: POST cancel for nonexistent run. Verify 404.

**Delete:**
13. **test_delete_completed_run**: Create and complete a run. DELETE. Verify 204. Verify GET status returns 404.
14. **test_delete_active_run_rejected**: Start a run (still running). DELETE. Verify 409.

### Commit

```
feat: add run history, cancel, and delete routes

GET /v1/graphs/{id}/runs lists paginated runs with status filter.
GET /v1/runs lists all runs for the authenticated owner.
POST /v1/runs/{id}/cancel stops running/paused runs.
DELETE /v1/runs/{id} removes completed/error runs.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
```

### Detailed Todolist

#### Pydantic schemas

- [ ] Open `app/schemas/runs.py`
- [ ] Add `RunListItem(BaseModel)`: `id: str`, `graph_id: str`, `status: str`, `input: dict` with default_factory, `duration_ms: int | None = None`, `created_at: str`, `error: str | None = None`
- [ ] Open `app/schemas/__init__.py`
- [ ] Add `RunListItem` to imports and `__all__`

#### Run history routes

- [ ] Open `app/routes/graphs.py`
- [ ] Add import: `RunListItem` from `app.schemas.runs`
- [ ] Implement `GET /{graph_id}/runs`:
  - Scope: `runs:read`
  - Query params: `limit: int = Query(20, ge=1, le=100)`, `offset: int = Query(0, ge=0)`, `status: str | None = Query(None)`
  - Fetch graph from DB with owner_id filtering -> 404 if not found
  - Call `crud.list_runs_by_graph(db, graph_id, owner_id=_owner_filter(auth), status=status, limit=limit, offset=offset)`
  - Map runs to `RunListItem` dicts
  - Return `PaginatedResponse(items=..., total=total, limit=limit, offset=offset, has_more=(offset + limit) < total)`

- [ ] Open `app/routes/runs.py`
- [ ] Add imports: `crud`, `RunListItem` from `app.schemas.runs`, `PaginatedResponse` from `app.schemas.pagination`
- [ ] Implement `GET /` (list all runs):
  - Scope: `runs:read`
  - Query params: `limit`, `offset`, `status`, `graph_id: str | None = Query(None)`
  - `owner_id = None if auth.is_admin else auth.owner_id`
  - Call `crud.list_runs(db, owner_id=owner_id, graph_id=graph_id, status=status, limit=limit, offset=offset)`
  - Map runs to `RunListItem` dicts
  - Return `PaginatedResponse`

#### Cancel route

- [ ] In `app/routes/runs.py`, implement `POST /{run_id}/cancel`:
  - Scope: `runs:write`
  - Get RunContext from RunManager
  - If ctx exists:
    - Ownership check (404 if wrong owner, unless admin)
    - If `ctx.status in ("running", "paused")`: call `run_manager.cancel_run(run_id)`, return 202 `{"detail": "Cancel requested"}`
    - Else: raise HTTPException 409 "Run is not cancellable"
  - If ctx is None:
    - `run = await crud.get_run(db, run_id, owner_id=_owner_filter(auth))`
    - If run is None: 404
    - If `run.status in ("running", "paused")`: stale record, call `await crud.update_run(db, run_id, status="error", error="Cancelled (server lost run)")`, return 202 `{"detail": "Cancel requested"}`
    - If `run.status in ("completed", "error")`: 409 "Run is not cancellable"

#### Delete route

- [ ] In `app/routes/runs.py`, implement `DELETE /{run_id}`:
  - Scope: `runs:write`
  - Check RunManager: if run is active (status in running/paused), raise 409 "Cannot delete an active run. Cancel it first."
  - `run = await crud.get_run(db, run_id, owner_id=auth.owner_id)`
  - If run is None: 404
  - If `run.status in ("running", "paused")`: 409 (defensive check for stale DB status)
  - Call `crud.delete_run(db, run_id, owner_id=_owner_filter(auth))` where `_owner_filter` returns None for admin
  - Add helper `_owner_filter(auth)` to `runs.py` (same pattern as `graphs.py`)
  - Return `Response(status_code=204)`

#### Tests

- [ ] Create `tests/unit/test_routes_phase4.py`
- [ ] Set up fixtures: client with httpx.AsyncClient + ASGITransport, DB, RunManager, test API key. Reuse pattern from `test_routes_runs.py`.
- [ ] Create helper: `_create_test_graph(client, api_key)` -- POST valid graph, return graph_id
- [ ] Create helper: `_create_test_run_in_db(db, graph_id, owner_id, status)` -- insert run directly into DB for history tests
- [ ] Add `test_list_runs_for_graph_empty`
- [ ] Add `test_list_runs_for_graph_paginated`
- [ ] Add `test_list_runs_for_graph_status_filter`
- [ ] Add `test_list_runs_for_graph_not_found`
- [ ] Add `test_list_runs_for_graph_wrong_owner`
- [ ] Add `test_list_all_runs`
- [ ] Add `test_list_all_runs_graph_id_filter`
- [ ] Add `test_list_all_runs_excludes_other_owners`
- [ ] Add `test_cancel_running_run`
- [ ] Add `test_cancel_already_completed`
- [ ] Add `test_cancel_stale_db_run`
- [ ] Add `test_cancel_not_found`
- [ ] Add `test_delete_completed_run`
- [ ] Add `test_delete_active_run_rejected`
- [ ] Run `uv run ruff check app/routes/ app/schemas/ tests/unit/test_routes_phase4.py`
- [ ] Run `uv run pytest tests/unit/test_routes_phase4.py -v`

#### Post-implementation housekeeping

- [ ] Update `.claude/skills/gw-execution/SKILL.md`: add all Phase 4 routes to "API routes (implemented)" section
- [ ] Update `.claude/gw-plans/execution/README.md`: mark Phase 4 status
- [ ] Run full test suite: `uv run pytest tests/unit/ -v`
- [ ] Run linter: `uv run ruff check app/ tests/`
- [ ] Run formatter: `uv run ruff format --check app/ tests/`

---

## Files Summary

| Action | File | Part | Notes |
|--------|------|------|-------|
| **create** | `app/db/migrations/003_run_indexes.py` | 4.1 | Composite indexes for run queries |
| **modify** | `app/db/crud.py` | 4.1 | Upgrade list_runs_by_graph, add list_runs, delete_run |
| **modify** | `app/schemas/graphs.py` | 4.2 | SchemaValidationError, ValidateResponse, ExportResponse |
| **modify** | `app/schemas/runs.py` | 4.3 | RunListItem |
| **modify** | `app/schemas/__init__.py` | 4.3 | Export RunListItem |
| **modify** | `app/routes/graphs.py` | 4.2, 4.3 | validate, export, list runs for graph |
| **modify** | `app/routes/runs.py` | 4.3 | list all runs, cancel, delete |
| **modify** | `tests/unit/test_crud.py` | 4.1 | 9 CRUD tests |
| **modify** | `tests/unit/test_routes.py` | 4.2 | 7 validate/export route tests |
| **create** | `tests/unit/test_routes_phase4.py` | 4.3 | 14 run history/cancel/delete tests |

---

## Not in Scope

- **Export code generation**: The `exporter.py` implementation stays in Phase 5. Phase 4 only adds the 501 stub route.
- **Persistent checkpointer**: `langgraph-checkpoint-sqlite` (Phase 5).
- **LLM retry/circuit-breaker**: Retry logic for transient LLM errors (Phase 5).
- **Custom httpx transport**: SSRF-safe DNS-pinning transport (Phase 5).
- **Run replay**: Step-through replay of past runs (v2).
- **Token-level streaming**: `stream_mode="messages"` for LLM token streaming (future).
- **Batch operations**: Bulk delete runs, bulk cancel (not v1).
- **Run retention policy**: Automatic cleanup of old runs after N days (not v1).
- **Run artifacts/attachments**: Storing files or images produced by runs (not v1).

---

## Decisions & Risks

| Decision / Risk | Mitigation |
|-----------------|------------|
| `list_runs_by_graph` return type changes from `list[Run]` to `tuple[list[Run], int]` | This is a breaking change to the internal API. No external callers exist. Update all call sites in Part 4.1. |
| `RunListItem` excludes `final_state` from list responses | Keeps paginated responses lightweight. Clients fetch individual run details via `GET /v1/runs/{id}/status`. |
| Validate endpoint calls both `validate_schema` and `build_graph` | `validate_schema` catches structural issues (missing start, orphan nodes). `build_graph` catches compilation issues (bad LLM config, unknown tools). Both are needed for thorough validation. |
| Export returns 501 -- frontend must handle this gracefully | 501 uses the standard error envelope. Frontend can check `status_code` and show "Coming soon" rather than an error. |
| Cancel of stale DB runs (server restarted) updates DB directly | The run is already lost -- the executor task is gone. Updating to "error" prevents the run from appearing stuck forever. |
| Delete is hard delete, not soft delete | Pre-production. Soft delete adds complexity (filter deleted runs from all queries). If needed later, add a `deleted_at` column in a future migration. |
| `status` query parameter uses Literal type | Use `Literal["running", "paused", "completed", "error"] | None` for OpenAPI documentation. Can be widened later without breaking clients. Invalid values return 422 via Pydantic validation. |
| New migration (003) adds indexes only | Additive, safe. No data changes. If migration fails, existing queries still work (just slower). |
| Two list-runs endpoints (per-graph and global) | Different use cases. Per-graph verifies graph ownership (404 if not owner). Global returns all runs for the authenticated key. Overlap is intentional. |

---

## Verification

```bash
cd packages/execution

# Part 4.1
uv run ruff check app/db/ tests/unit/test_crud.py
uv run ruff format --check app/db/ tests/unit/test_crud.py
uv run pytest tests/unit/test_crud.py -v

# Part 4.2
uv run ruff check app/schemas/ app/routes/graphs.py tests/unit/test_routes.py
uv run ruff format --check app/schemas/ app/routes/graphs.py tests/unit/test_routes.py
uv run pytest tests/unit/test_routes.py -v

# Part 4.3
uv run ruff check app/routes/ app/schemas/ tests/unit/test_routes_phase4.py
uv run ruff format --check app/routes/ app/schemas/ tests/unit/test_routes_phase4.py
uv run pytest tests/unit/test_routes_phase4.py -v

# Full suite (after all parts)
uv run ruff check app/ tests/
uv run ruff format --check app/ tests/
uv run pytest tests/unit/ -v
```

Manual testing:

```bash
# 1. Validate a graph
curl -X POST localhost:8000/v1/graphs/<graph-id>/validate \
  -H "X-API-Key: gw_<key>" \
  -H "Content-Type: application/json"

# 2. Try export (expect 501)
curl localhost:8000/v1/graphs/<graph-id>/export \
  -H "X-API-Key: gw_<key>"

# 3. List runs for a graph
curl "localhost:8000/v1/graphs/<graph-id>/runs?limit=5&status=completed" \
  -H "X-API-Key: gw_<key>"

# 4. List all runs
curl "localhost:8000/v1/runs?limit=10" \
  -H "X-API-Key: gw_<key>"

# 5. Cancel a run
curl -X POST localhost:8000/v1/runs/<run-id>/cancel \
  -H "X-API-Key: gw_<key>" \
  -H "Content-Type: application/json"

# 6. Delete a run
curl -X DELETE localhost:8000/v1/runs/<run-id> \
  -H "X-API-Key: gw_<key>"
```
