---
name: gw-execution
description: "FastAPI routes, API key auth, scoped permissions, LangGraph builder (GraphSchema to StateGraph), SSE streaming, tool registry pattern, human-in-the-loop resume server logic, graph validation endpoint, run history storage, export/code generation, and migration runner. Load when working on FastAPI routes, auth, API keys, LangGraph builder, SSE streaming, tool registry, validation, run history, export generation, or migrations."
disable-model-invocation: true
---

# Skill: Execution

Load this when: working on FastAPI routes, auth, API keys, LangGraph builder,
SSE streaming, tool registry, export generation, or migrations.
Also load schema.md — the execution layer consumes GraphSchema.

---

## Package structure

```
packages/execution/
├── app/
│   ├── main.py          # FastAPI app, CORS, middleware, exception handlers
│   ├── middleware.py     # RequestID + ContentType middleware
│   ├── cli.py           # CLI for API key management (create-key, list-keys, revoke-key)
│   ├── builder.py       # GraphSchema → LangGraph StateGraph (stub)
│   ├── executor.py      # run management, SSE streaming (stub)
│   ├── exporter.py      # Python code generation (stub)
│   ├── logging.py       # structured JSON logging with request_id
│   ├── state_utils.py   # resolve_input_map via simpleeval
│   ├── auth/
│   │   ├── __init__.py  # scope constants (SCOPES_DEFAULT, SCOPES_ADMIN, ALL_SCOPES)
│   │   ├── keys.py      # key generation (gw_ prefix), SHA-256 hashing
│   │   └── deps.py      # FastAPI deps: APIKeyHeader, require_auth, require_scope
│   ├── routes/
│   │   ├── auth.py      # POST/GET/DELETE /v1/auth/keys (admin only)
│   │   └── graphs.py    # CRUD /v1/graphs with scope + owner isolation
│   ├── schemas/
│   │   ├── common.py    # ErrorResponse
│   │   ├── auth.py      # CreateKeyRequest/Response, KeyInfo
│   │   ├── graphs.py    # Create/UpdateGraphRequest, GraphResponse
│   │   └── pagination.py # PaginatedResponse
│   ├── tools/
│   │   ├── base.py      # BaseTool ABC + ToolNotFoundError
│   │   ├── registry.py  # REGISTRY dict, get_tool()
│   │   ├── calculator.py
│   │   ├── datetime_tool.py
│   │   └── url_fetch.py # SSRF guard, no redirects
│   └── db/
│       ├── connection.py # init_db, close_db, get_db (FastAPI Depends)
│       ├── models.py     # ApiKey, Graph, Run dataclasses
│       ├── crud.py       # async CRUD for graphs/runs with owner_id filtering
│       ├── crud_auth.py  # async CRUD for api_keys
│       └── migrations/
│           ├── runner.py      # migration discovery + execution
│           ├── 001_initial.py # graphs, runs, schema_version tables
│           └── 002_auth.py    # api_keys table, owner_id on graphs/runs
├── tests/
│   ├── conftest.py       # shared db fixture, create_test_key helper
│   └── unit/             # 89 tests
├── .env.example
├── pyproject.toml
└── uv.lock
```

## Authentication

API keys via `X-API-Key` header (using `fastapi.security.APIKeyHeader`).
Key = identity. `owner_id` = `api_key.id`.

```python
# Scopes
SCOPES_DEFAULT = ["graphs:read", "graphs:write", "runs:read", "runs:write"]
SCOPES_ADMIN = [*SCOPES_DEFAULT, "admin"]

# Dependencies (app/auth/deps.py)
api_key_header = APIKeyHeader(name="X-API-Key")

async def require_auth(raw_key, db) -> AuthContext
    # hash → lookup → 401 if invalid/revoked

def require_scope(scope: str)
    # returns dependency: 403 if scope missing

require_admin = require_scope("admin")
```

Bootstrap: `uv run python -m app.cli create-key --name admin --scopes all`

Future: `Authorization: Bearer <firebase-jwt>` for browser auth (separate header, no collision).

## API routes (implemented)

All authenticated routes use `/v1/` prefix. System endpoints are unversioned.

```
# System (unversioned, open)
GET    /health                      status + llm/auth configured
GET    /settings/providers          provider config (no key values)

# Auth (admin scope required)
POST   /v1/auth/keys               create key → 201 + raw key (shown once)
GET    /v1/auth/keys               list keys (paginated, key_hash excluded)
DELETE /v1/auth/keys/{id}          revoke key (409 if last admin)

# Graphs (scoped)
POST   /v1/graphs                  create graph → 201
GET    /v1/graphs                  list own graphs (paginated, admin: all)
GET    /v1/graphs/{id}             get graph (404 if not owner)
PUT    /v1/graphs/{id}             update graph
DELETE /v1/graphs/{id}             delete graph → 204
```

## API routes (planned — not yet implemented)

```
POST   /v1/graphs/{id}/run         start run → { run_id }
GET    /v1/graphs/run/{id}/stream  SSE stream
GET    /v1/graphs/run/{id}/status  reconnection recovery
POST   /v1/graphs/run/{id}/resume  human-in-the-loop resume
POST   /v1/graphs/{id}/validate    pre-run validation
GET    /v1/graphs/{id}/export      generate Python + requirements.txt
```

## Response patterns

```python
# Success — flat, typed, proper HTTP codes
# POST → 201, GET/PUT → 200, DELETE → 204 (empty body)
{"id": "...", "name": "My Graph", "owner_id": "...", ...}

# List — paginated
{"items": [...], "total": 42, "limit": 20, "offset": 0, "has_more": true}

# Error — envelope with status_code
{"detail": "Graph not found", "status_code": 404}
{"detail": [...validation errors...], "status_code": 422}
```

## Middleware

- **RequestIDMiddleware**: reads `X-Request-ID`, generates UUID if missing, echoes in response
- **ContentTypeMiddleware**: rejects POST/PUT/PATCH without `Content-Type: application/json` → 415
- **CORS**: explicit origins, `allow_headers=["Content-Type", "X-API-Key", "X-Request-ID"]`
- **Rate limiting**: slowapi, 60/min default, `headers_enabled=True` (X-RateLimit-* headers)

## Tool registry pattern

```python
# app/tools/base.py — BaseTool is sync. Executor wraps in asyncio.to_thread().
class BaseTool(ABC):
    name: str
    description: str
    def run(self, inputs: dict) -> dict:
        # { "success": True/False, "result"/"error", "recoverable": bool }

# app/tools/registry.py
REGISTRY: dict[str, BaseTool] = {
    "calculator":    CalculatorTool(),   # simpleeval, MAX_POWER=1000
    "datetime":      DatetimeTool(),     # fromisoformat only
    "url_fetch":     UrlFetchTool(),     # SSRF guard, follow_redirects=False
}
```

## Database

SQLite via aiosqlite. WAL mode. Migrations run on startup in transactions.

```python
# Models (app/db/models.py)
ApiKey: id, name, key_hash, key_prefix, scopes, status, created_at, revoked_at
Graph:  id, name, schema_json, owner_id, created_at, updated_at
Run:    id, graph_id, owner_id, status, input, final_state, duration_ms, ...

# CRUD conventions
# owner_id: str | None = None → None means admin (no filter)
# get/update → X | None (never raises for not-found)
# delete → bool
# list → (list[X], total) for pagination
```

## CLI

```bash
uv run python -m app.cli create-key --name admin --scopes all
uv run python -m app.cli create-key --name CI --scopes graphs:read,graphs:write
uv run python -m app.cli list-keys
uv run python -m app.cli revoke-key KEY_ID
```
