# Execution Layer — Phase 1: DB Layer + Tools + State Utils

## Current State (as of scaffold)

**Exists already:**
- `app/main.py` — FastAPI app with CORS (localhost:3000 only), rate limiting, health check, `/settings/providers`. Uses deprecated `@app.on_event("startup")` that hard-crashes if no LLM keys.
- `app/db/models.py` — `Run` dataclass only (no `Graph`).
- `app/db/migrations/001_initial.py` — DDL for `graphs`, `runs`, `schema_version` tables. Has `VERSION = 1` and `up(db)` function. Already does its own `INSERT OR IGNORE` for version — leave as-is (migrations are append-only).
- `app/tools/registry.py` — `BaseTool` ABC (sync `run()`), `REGISTRY` dict, `get_tool()`, `ToolNotFoundError`.
- `app/logging.py` — JSON structured logging.
- `tests/unit/test_tools.py` — single test for unknown tool.
- Empty `__init__.py` files in `app/`, `app/db/`, `app/tools/`, `tests/`, `tests/unit/`, `tests/integration/`, `app/db/migrations/`.
- Stub files: `app/builder.py`, `app/executor.py`, `app/exporter.py` (not touched in Phase 1).
- Dependencies: `simpleeval`, `httpx`, `trafilatura` already in pyproject.toml. `aiosqlite` is **missing**.

---

## Part A: Database Layer

### A1. Add dependency

```bash
cd packages/execution && uv add aiosqlite
```

### A2. Create `app/db/connection.py`

DB lifecycle + FastAPI dependency.

```python
get_db_path() -> str
    # Reads DB_PATH env var, defaults to "data/graphweave.db" (relative path).
    #
    # Why relative: absolute "/data/..." requires sudo outside Docker.
    # In Docker, DB_PATH is set explicitly in .env → "/data/graphweave.db".
    # Outside Docker (local dev), relative path just works from CWD.
    # Tests use ":memory:" via fixture — unaffected.

async init_db() -> aiosqlite.Connection
    # 1. os.makedirs(parent_dir, exist_ok=True)
    # 2. Run migrations via sync sqlite3 (runner.run_migrations)
    # 3. Open aiosqlite connection with row_factory = aiosqlite.Row
    # 4. Enable WAL mode (PRAGMA journal_mode=WAL)
    #    WAL enables concurrent reads during SSE streaming.
    #    -wal/-shm files work fine on Docker bind mounts.
    # 5. Return connection

async close_db(db: aiosqlite.Connection) -> None
    # Close the connection

def get_db(request: Request) -> aiosqlite.Connection
    # FastAPI Depends() — reads request.app.state.db
```

### A3. Create `app/db/migrations/runner.py`

Migration discovery + execution using sync sqlite3 (runs once at startup).

```
run_migrations(db_path: str) -> None

Flow:
1. Connect via sync sqlite3
2. Ensure schema_version table exists
3. Read current version (0 if fresh)
4. Discover migration modules in app/db/migrations/ matching NNN_*.py pattern
5. Sort by version number
6. For each pending migration (version > current):
   a. BEGIN TRANSACTION
   b. Call migration.up(db)
   c. INSERT OR REPLACE INTO schema_version (version) VALUES (?)
   d. COMMIT
   e. On error: ROLLBACK, raise MigrationError with version + cause
7. Close sync connection

class MigrationError(Exception):
    # Includes version number and original error
```

**Important**: The existing `001_initial.py` already inserts version 1 into schema_version inside `up()`. The runner uses INSERT OR REPLACE after calling `up()`, making this idempotent regardless. Don't edit the existing migration — migrations are append-only.

### A4. Modify `app/db/models.py` — Add `Graph` dataclass

```python
@dataclass
class Graph:
    id: str
    name: str
    schema_json: dict          # Full GraphSchema stored verbatim (not stripped)
    created_at: str            # ISO 8601
    updated_at: str            # ISO 8601
```

**Design note on duplication:** The `graphs` table has `id`, `name`, `created_at`, `updated_at` columns that overlap with fields inside `schema_json` (which holds the full GraphSchema). These serve different purposes:
- Table columns → indexing, listing, querying
- `schema_json` → the document sent to the builder for execution

`update_graph` keeps them in sync (see A5). If they ever drift, table columns are authoritative for listings, `schema_json` is authoritative for execution.

Add alongside existing `Run` dataclass. No other changes to `Run`.

### A5. Create `app/db/crud.py`

All async CRUD using aiosqlite. Parameterized queries only.

```python
# Graphs
async create_graph(db, name: str, schema_dict: dict) -> Graph
    # Generate UUID, set created_at/updated_at to utcnow ISO, json.dumps schema.
    # Route layer passes name + full schema dict separately — CRUD doesn't
    # parse GraphSchema internals. Route decides which "name" wins if they differ.

async list_graphs(db) -> list[Graph]
async get_graph(db, graph_id: str) -> Graph | None
async update_graph(db, graph_id: str, name: str, schema_dict: dict) -> Graph | None
    # Updates updated_at on table column.
    # Also patches schema_dict["name"] and schema_dict["metadata"]["updated_at"]
    # to stay in sync with table columns before storing.
    # Returns None if graph_id not found.
async delete_graph(db, graph_id: str) -> bool
    # Returns False if not found

# Runs
async create_run(db, graph_id: str, status: str, input_data: dict) -> Run
    # CRUD generates id (UUID) and created_at (UTC ISO) — same as create_graph.
    # Caller does NOT construct a Run object. Consistent creation pattern.
async get_run(db, run_id: str) -> Run | None
async update_run(db, run_id: str, **fields) -> Run | None
    # Whitelisted fields only. Raises ValueError on invalid field names.
    # Returns None if run_id not found.
async list_runs_by_graph(db, graph_id: str, limit: int = 10) -> list[Run]
    # Ordered by created_at DESC
```

**Critical — `update_run` field allowlist:**
```python
_UPDATABLE_RUN_FIELDS = {
    "status", "final_state", "duration_ms", "error",
    "paused_node_id", "paused_prompt",
}

async def update_run(db, run_id: str, **fields) -> Run | None:
    invalid = set(fields) - _UPDATABLE_RUN_FIELDS
    if invalid:
        raise ValueError(f"Cannot update fields: {invalid}")
    # ... build SET clause from valid field names, parameterize values
```
Column names can't be parameterized in SQL — `**kwargs` without a whitelist is an injection surface. `ValueError` (not silent ignore) so callers discover bugs immediately.

**Not-found convention (consistent across all CRUD):**
- `get_*` → returns `X | None`
- `update_*` → returns `X | None`
- `delete_*` → returns `bool`
- Never raises for expected "not found" — route layer does `if not result: raise HTTPException(404)`

JSON fields: `schema_json` stored as TEXT via `json.dumps`/`json.loads`.
Run fields: `input` ↔ `input_json`, `final_state` ↔ `final_state_json`.

### A6. Modify `app/main.py`

Changes:
1. **Replace** `@app.on_event("startup")` with `@asynccontextmanager async def lifespan(app)` pattern.
2. Lifespan: `run_migrations(db_path)` → `init_db()` → store on `app.state.db` → yield → `close_db()`.
3. LLM key check becomes a **warning** log, not a crash. Health endpoint gains `"llm_configured": bool`.
4. Add `http://localhost:5173` to CORS origins (Vite dev server).
5. Pass `lifespan=lifespan` to `FastAPI()` constructor.

### A7. Tests

**`tests/unit/test_migrations.py`**:
- Fresh DB: migrations run, tables exist, version = 1
- Idempotent: running twice doesn't error
- Bad migration: rolls back, raises MigrationError

**`tests/unit/test_crud.py`**:
- Create graph → get returns it with correct fields
- List graphs returns all
- Update graph changes name/schema/updated_at, syncs into schema_json
- Update graph with nonexistent ID returns None
- Delete graph → get returns None, delete returns False on missing
- Create run → get returns it
- Update run partial fields
- Update run with invalid field name → raises ValueError
- Update run with nonexistent ID returns None
- List runs by graph, respects limit, ordered DESC
- get_run/get_graph return None for missing IDs

Both test files use in-memory SQLite (`:memory:`) via fixtures.

---

## Part B: Tools + State Utils

### B1. Create `app/state_utils.py`

```python
class InputMapError(Exception):
    def __init__(self, field: str, expression: str, cause: Exception): ...

def _to_namespace(obj):
    """Recursively convert dicts to SimpleNamespace for attribute access in simpleeval.

    Without this, expressions like "messages[-1].content" fail because
    simpleeval resolves attribute access on objects, but dicts don't
    support dot-notation. SimpleNamespace does.

    Only affects the simpleeval namespace — original state dict is never mutated.
    """
    if isinstance(obj, dict):
        return SimpleNamespace(**{k: _to_namespace(v) for k, v in obj.items()})
    if isinstance(obj, list):
        return [_to_namespace(item) for item in obj]
    return obj

def resolve_input_map(input_map: dict[str, str], state: dict) -> dict
    # 1. Convert state to SimpleNamespace tree via _to_namespace()
    # 2. For each key/expression pair:
    #    a. Create EvalWithCompoundTypes with namespace as names
    #    b. No builtins, no globals — state namespace only
    #    c. Set MAX_POWER = 1000, MAX_STRING_LENGTH = 100_000
    #    d. Evaluate expression
    #    e. On KeyError: raise InputMapError listing available state fields
    #    f. On other error: raise InputMapError with field, expression, cause
    # 3. Return dict of resolved values
```

**Why SimpleNamespace:** State is a flat dict with potentially nested values (`{"messages": [...], "counter": 0}`). Keys come from `StateField.key` in GraphSchema. `input_map` expressions use dot notation (`messages[-1].content`) to traverse into list-of-dict structures. simpleeval resolves attribute access on objects but not on dicts — SimpleNamespace bridges this.

### B2. Create `app/tools/calculator.py`

```python
class CalculatorTool(BaseTool):
    name = "calculator"
    description = "Evaluate mathematical expressions"

    def run(self, inputs: dict) -> dict:
        # inputs["expression"] → EvalWithCompoundTypes
        # Set MAX_POWER = 1000 to prevent 2**2**2**... CPU bombs
        # Set MAX_STRING_LENGTH = 100_000 to prevent "a" * 10**9 memory bombs
        # Success: {"success": True, "result": str(value), "source": "simpleeval", "truncated": False}
        # Failure: {"success": False, "error": str, "recoverable": True}
        # Division by zero, invalid syntax → recoverable: True
```

**Resource limits are mandatory.** simpleeval's defaults are permissive (MAX_POWER=4M). Explicitly setting these two values eliminates the entire resource exhaustion class.

### B3. Create `app/tools/datetime_tool.py`

```python
class DatetimeTool(BaseTool):
    name = "datetime"
    description = "Get current time, format, or parse dates"

    def run(self, inputs: dict) -> dict:
        # inputs["action"]: "now" | "format" | "parse"
        # "now": datetime.now(UTC).isoformat()
        # "format": datetime.fromisoformat(inputs["date"]).strftime(inputs["fmt"])
        # "parse": datetime.fromisoformat(inputs["date"]).isoformat()
        # Unknown action: {"success": False, "error": "Unknown action: ...", "recoverable": False}
```

**Parsing strategy:** `fromisoformat` only — no `dateutil.parser`. It handles the common cases (`2026-03-13`, `2026-03-13T10:00:00+00:00`) and is stdlib. `dateutil.parser.parse` guesses ambiguous inputs (is `01/02/03` Jan 2 or Feb 1?) — guessing in a tool the LLM relies on is worse than failing clearly. If the LLM passes `"March 13, 2026"`, it gets a recoverable error and learns to use ISO format.

### B4. Create `app/tools/url_fetch.py`

```python
class UrlFetchTool(BaseTool):
    name = "url_fetch"
    description = "Fetch and extract text content from a URL"

    def run(self, inputs: dict) -> dict:
        # inputs["url"] → validate_url() → httpx.Client.get() → trafilatura.extract()
        # Uses httpx.Client (sync), NOT AsyncClient.
        #   BaseTool.run() is sync. Executor wraps in asyncio.to_thread() — safe for I/O.
        # Timeout: 10 seconds
        # follow_redirects=False — redirects are an SSRF vector
        #   (public URL redirects to http://169.254.169.254/)
        # Truncate to 10_000 chars, set truncated: True if exceeded
        # Success: {"success": True, "result": text, "source": url, "truncated": bool}
        # Empty extraction: {"success": True, "result": "", "source": url,
        #     "truncated": False, "warning": "No extractable text content"}
        #   Not a failure — HTTP succeeded, page just has no text. LLM decides what to do.
        #   success: False would trigger retry logic, which won't help.

def validate_url(url: str) -> str | None:
    # Returns error string if invalid, None if OK
    # 1. Parse URL — only http:// and https:// schemes
    # 2. Resolve hostname via socket.getaddrinfo()
    # 3. Check resolved IP against private/reserved ranges:
    #    127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.0.0/16, ::1
    # 4. Return error message if blocked, None if safe
```

**SSRF protection is a hard requirement.** The `validate_url` guard runs before any HTTP request.

**Known limitation — DNS rebinding:** Hostname is resolved once for validation, then resolved again by httpx for the actual connection. A DNS rebinding attack could return a public IP first and a private IP second. Proper fix requires a custom httpx transport that pins the resolved IP — scoped to Phase 5. Production mitigation: Cloud Run has no access to GCP metadata API by default (requires explicit IAM). The SSRF guard is defense-in-depth, not the sole layer.

### B5. Modify `app/tools/registry.py`

Add imports and register all 3 tools in `REGISTRY`:

```python
from app.tools.calculator import CalculatorTool
from app.tools.datetime_tool import DatetimeTool
from app.tools.url_fetch import UrlFetchTool

REGISTRY: dict[str, BaseTool] = {
    "calculator": CalculatorTool(),
    "datetime": DatetimeTool(),
    "url_fetch": UrlFetchTool(),
}
```

Keep `BaseTool`, `ToolNotFoundError`, and `get_tool()` as-is.

**Design note on sync `BaseTool.run()`:** Intentionally kept sync. Only `url_fetch` does I/O. The executor (Phase 3) calls `await asyncio.to_thread(tool.run, inputs)` — the standard pattern for wrapping sync I/O in async FastAPI. Making BaseTool async would force `calculator` and `datetime` to be `async def` for no reason. Comment on BaseTool docstring documents this contract.

### B6. Tests

**`tests/unit/test_state_utils.py`**:
- Simple field access: `"foo"` → state["foo"]
- Nested/index access: `"messages[-1].content"` on list-of-dicts state (locks in SimpleNamespace behavior)
- Arithmetic: `"counter + 1"`
- Missing field → InputMapError with helpful message listing available fields
- Invalid expression → InputMapError

**`tests/unit/test_tools/test_calculator.py`**:
- Basic math: `"2 + 2"` → 4
- Division by zero → success: False, recoverable: True
- Invalid expression → success: False, recoverable: True
- Exponentiation within limits works
- Exponentiation exceeding MAX_POWER → handled gracefully

**`tests/unit/test_tools/test_datetime.py`**:
- "now" returns valid ISO timestamp
- "format" with date + fmt
- "parse" with ISO date string
- Non-ISO date string (e.g. "March 13") → recoverable error
- Unknown action → success: False, recoverable: False

**`tests/unit/test_tools/test_url_fetch.py`**:
- Mock httpx + trafilatura: successful fetch + extract
- Empty trafilatura extraction → success: True with warning
- Truncation at 10K chars
- httpx timeout → recoverable: True
- Bad URL (no scheme) → recoverable: False
- SSRF: mock `socket.getaddrinfo` → private IP → blocked, recoverable: False
- SSRF: localhost → blocked, recoverable: False

**`tests/unit/test_tools/test_registry.py`** (moved from `tests/unit/test_tools.py`):
- Existing: unknown tool raises `ToolNotFoundError`
- New: smoke test that all 3 registered tools are retrievable and have correct names

Create `tests/unit/test_tools/__init__.py` (empty).

---

## Files Summary

| Action | File | Notes |
|--------|------|-------|
| **add dep** | `pyproject.toml` | `aiosqlite` |
| **create** | `app/db/connection.py` | DB lifecycle + FastAPI dep |
| **create** | `app/db/migrations/runner.py` | Sync migration runner |
| **create** | `app/db/crud.py` | Async CRUD with field allowlist |
| **create** | `app/state_utils.py` | `resolve_input_map` with SimpleNamespace conversion |
| **create** | `app/tools/calculator.py` | `CalculatorTool` with resource limits |
| **create** | `app/tools/datetime_tool.py` | `DatetimeTool`, fromisoformat only |
| **create** | `app/tools/url_fetch.py` | `UrlFetchTool`, sync httpx, SSRF guard, no redirects |
| **modify** | `app/db/models.py` | Add `Graph` dataclass |
| **modify** | `app/main.py` | Lifespan, warn-not-crash, CORS |
| **modify** | `app/tools/registry.py` | Register 3 tools, document sync contract |
| **move** | `tests/unit/test_tools.py` → `tests/unit/test_tools/test_registry.py` | Add smoke test |
| **create** | `tests/unit/test_tools/__init__.py` | Empty |
| **create** | `tests/unit/test_migrations.py` | |
| **create** | `tests/unit/test_crud.py` | |
| **create** | `tests/unit/test_state_utils.py` | |
| **create** | `tests/unit/test_tools/test_calculator.py` | |
| **create** | `tests/unit/test_tools/test_datetime.py` | |
| **create** | `tests/unit/test_tools/test_url_fetch.py` | |

---

## Verification

```bash
cd packages/execution
uv sync                                    # picks up aiosqlite
uv run ruff check app/ tests/             # lint passes
uv run ruff format --check app/ tests/    # format passes
uv run pytest tests/unit/ -v              # all tests pass
```

Manual: start Docker dev container → `/health` returns `{"status": "ok", "llm_configured": false}` → SQLite file created in `/data/` → migrations logged on startup.

---

## Decisions & Risks

| Risk | Mitigation |
|------|------------|
| DB file path doesn't exist on first run | `init_db()` calls `os.makedirs(parent, exist_ok=True)` |
| Absolute default path needs sudo outside Docker | Default is relative `data/graphweave.db`. Docker sets `DB_PATH=/data/graphweave.db` via .env |
| Migration fails mid-transaction | Runner wraps each in transaction, rolls back on failure, raises `MigrationError`, server refuses to start |
| Concurrent server starts race on migrations | SQLite file-level locking. Acceptable for single-host |
| SQL injection via `update_run(**fields)` column names | Explicit `_UPDATABLE_RUN_FIELDS` allowlist; `ValueError` on invalid fields |
| `schema_json` drifts from table columns | `update_graph` patches `schema_dict["name"]` and `schema_dict["metadata"]["updated_at"]` before storing |
| Expression injection via input_map | `simpleeval` blocks imports/function defs. State namespace only — no builtins, no globals |
| simpleeval resource exhaustion | `MAX_POWER = 1000`, `MAX_STRING_LENGTH = 100_000` on all evaluators |
| Dot-access on dicts fails in simpleeval | `_to_namespace()` converts state dicts to `SimpleNamespace` recursively |
| `url_fetch` blocks event loop | `BaseTool.run()` is sync; executor wraps in `asyncio.to_thread()` (Phase 3) |
| SSRF via url_fetch | `validate_url()` resolves hostname, blocks private/reserved IPs. `follow_redirects=False` blocks redirect-based SSRF |
| DNS rebinding bypasses SSRF guard | Known limitation. Custom httpx transport in Phase 5. Cloud Run lacks metadata API access by default |
| trafilatura extracts nothing | Returns `success: True` with empty result + warning. Not a failure — avoids spurious retries |
| Forgetting LLM keys in production | Warning log + health endpoint shows `llm_configured: false`. Builder hard-fails at compile time |

---

## Roadmap (not this phase)

- **Phase 1.5**: Auth — API keys (headless) + Firebase tokens (UI)
- **Phase 2**: GraphSchema → LangGraph builder
- **Phase 3**: Executor + SSE streaming (adds `asyncio.to_thread` for tool calls)
- **Phase 4**: API routes
- **Phase 5**: Exporter + remaining tools + custom httpx transport for SSRF
- **Phase 6**: Deployment — Cloud Run + Turso + Vercel + CI/CD

---

## Implementation Log — Deviations

### Deviation 1: Extracted `BaseTool` to `app/tools/base.py`

**Plan said**: Keep `BaseTool` and `ToolNotFoundError` in `app/tools/registry.py`.

**What happened**: Circular import — `registry.py` imports tool classes, each tool imports `BaseTool` from `registry.py`. Python can't resolve the cycle when tests import individual tools directly.

**Fix**: Extracted to `app/tools/base.py`. Tools import from `base.py`, registry imports both. No circular dependency. One extra file, cleaner import graph.

### Deviation 2: `simpleeval` resource limits are module-level, not instance-level

**Plan said**: Set `evaluator.MAX_POWER = 1000` on each `EvalWithCompoundTypes` instance.

**What happened**: These are module-level globals. `safe_power()` reads the module global, not instance attributes. Setting them per-instance had no effect.

**Fix**: Patched at module level at import time in `calculator.py` and `state_utils.py`. All evaluators share the same limits — acceptable.

### Deviation 3: Missing field raises `NameNotDefined`, not `KeyError`

**Plan said**: Catch `KeyError` for missing fields in `resolve_input_map`.

**What happened**: `simpleeval` raises `NameNotDefined` (custom exception). Its constructor takes two args so re-wrapping with `type(exc)(...)` failed.

**Fix**: Catch both `KeyError` and `NameNotDefined`. Wrap as `ValueError` with available fields listed.
