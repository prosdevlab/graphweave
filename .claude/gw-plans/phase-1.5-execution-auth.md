# Phase 1.5: Scoped API Key Auth + Multi-Tenancy + Stub Routes

## Context

The execution layer has zero authentication. All endpoints are open. Before building more surface area (Phase 2+), we need a gate and ownership model. This phase adds standalone scoped API keys, multi-tenancy, and stub CRUD routes.

**Approach**: Standalone API keys (no users table). Key = identity. CLI creates keys with scopes. Whoever has the key can use it. `owner_id` = `key.id`. User accounts come later with Firebase/UI auth.

---

## Architecture

### Key Lifecycle

```
  ┌─────────────────────────────────────────────────────────────┐
  │ BOOTSTRAP (CLI — one time)                                  │
  │                                                             │
  │  $ uv run python -m app.cli create-key \                    │
  │      --name "admin" --scopes all                            │
  │                                                             │
  │  Creates key with all scopes (including admin)              │
  │  Prints raw key to stdout — shown ONCE                      │
  │  → gw_abc123...                                            │
  └─────────────────────────────────────────────────────────────┘
                              │
                              ▼
  ┌─────────────────────────────────────────────────────────────┐
  │ PROVISION MORE KEYS (admin key via API)                     │
  │                                                             │
  │  POST /auth/keys                                            │
  │  X-API-Key: gw_<admin-key>                                  │
  │  { "name": "Team CI", "scopes": ["graphs:read"] }          │
  │  → { "api_key": "gw_xyz789..." }                           │
  │                                                             │
  │  Give this key to anyone — fully transferable               │
  └─────────────────────────────────────────────────────────────┘
                              │
                              ▼
  ┌─────────────────────────────────────────────────────────────┐
  │ NORMAL USAGE                                                │
  │                                                             │
  │  GET /graphs                                                │
  │  X-API-Key: gw_xyz789...                                    │
  │  → [ ...graphs owned by this key... ]                      │
  └─────────────────────────────────────────────────────────────┘
```

### Auth Decision Tree

```
Incoming Request
      │
      ▼
X-API-Key header present?
(via fastapi.security.APIKeyHeader — auto 401 + OpenAPI integration)
      │
   no │              yes
      ▼                ▼
    401           hash(token) via SHA-256
  + WWW-Auth      lookup api_keys by key_hash
    header             │
                  found + active?
                       │
                 no    │    yes
                  ▼    │     ▼
                 401   │   required scope in key.scopes?
                       │        │
                       │   no   │   yes
                       │    ▼   │    ▼
                       │   403  │  AuthContext
                       │        │  owner_id = key.id
                       │        │  scopes = key.scopes
                       │        │  is_admin = "admin" in scopes
```

### Database Schema (after migration 002)

```
┌─────────────────────────────┐
│          api_keys           │
├─────────────────────────────┤
│ id          TEXT PK         │
│ name        TEXT NOT NULL   │
│ key_hash    TEXT UNIQUE     │──── SHA-256 of raw key
│ key_prefix  TEXT NOT NULL   │──── "gw_abc1234" (display only)
│ scopes      TEXT NOT NULL   │──── JSON: ["graphs:read", ...]
│ status      TEXT NOT NULL   │──── active | revoked
│ created_at  TEXT NOT NULL   │
│ revoked_at  TEXT            │
└──────────┬──────────────────┘
           │ api_keys.id = graphs.owner_id
           │ api_keys.id = runs.owner_id
           │
     ┌─────┴──────┐
     ▼            ▼
┌─────────────────────────────┐  ┌─────────────────────────────┐
│          graphs             │  │           runs              │
├─────────────────────────────┤  ├─────────────────────────────┤
│ id          TEXT PK         │  │ id          TEXT PK         │
│ name        TEXT NOT NULL   │  │ graph_id    TEXT FK→graphs  │
│ schema_json TEXT NOT NULL   │  │ owner_id    TEXT NOT NULL   │
│ owner_id    TEXT NOT NULL   │  │ status      TEXT NOT NULL   │
│ created_at  TEXT NOT NULL   │  │ input_json  TEXT            │
│ updated_at  TEXT NOT NULL   │  │ final_state_json TEXT      │
└─────────────────────────────┘  │ duration_ms INTEGER        │
                                 │ created_at  TEXT NOT NULL   │
                                 │ error       TEXT            │
                                 │ paused_node_id TEXT        │
                                 │ paused_prompt  TEXT        │
                                 └─────────────────────────────┘
```

### Scopes

```
Scope            Grants access to                       CLI flag
──────────────────────────────────────────────────────────────────
graphs:read      GET /graphs, GET /graphs/{id}          --scopes graphs:read
graphs:write     POST /graphs, PUT/DELETE /graphs/{id}  --scopes graphs:write
runs:read        (future Phase 3 — defined now)         --scopes runs:read
runs:write       (future Phase 3 — defined now)         --scopes runs:write
admin            Create/list/revoke keys, see all data  --scopes all
```

`--scopes all` = shorthand for every scope including admin.

### Tenant Isolation

```
Key A (read+write)               Key B (read+write)
┌────────────────────┐           ┌────────────────────┐
│ owner_id = key_A   │           │ owner_id = key_B   │
└────────┬───────────┘           └────────┬───────────┘
         │                                │
         ▼                                ▼
  ┌──────────────┐                 ┌──────────────┐
  │ Graph 1 (A)  │                 │ Graph 3 (B)  │
  │ Graph 2 (A)  │                 │ Graph 4 (B)  │
  └──────────────┘                 └──────────────┘

Admin key: sees ALL graphs from ALL keys
```

### Route Map

```
OPEN:
  /health ─────────────── GET              status + llm/auth configured
  /settings/providers ─── GET              provider config

ADMIN (scope: admin):
  /auth/keys ──────────── POST             create new key with scopes
  /auth/keys ──────────── GET              list all keys
  /auth/keys/{id} ─────── DELETE           revoke any key

SCOPED:
  /graphs ─────────────── POST (graphs:write)  create graph
  /graphs ─────────────── GET  (graphs:read)   list own (admin: all)
  /graphs/{id} ────────── GET  (graphs:read)   get (404 if not owner)
  /graphs/{id} ────────── PUT  (graphs:write)  update (404 if not owner)
  /graphs/{id} ────────── DELETE (graphs:write) delete (404 if not owner)
```

### Pydantic Response Models

```
app/schemas/
├── __init__.py
├── auth.py        # CreateKeyRequest, CreateKeyResponse, KeyInfo
└── graphs.py      # CreateGraphRequest, UpdateGraphRequest, GraphResponse
```

```python
# Response envelope — consistent across all endpoints
class SuccessResponse(BaseModel, Generic[T]):
    success: Literal[True] = True
    data: T

# Auth schemas
class CreateKeyRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    scopes: list[str]

class CreateKeyResponse(BaseModel):
    id: str
    name: str
    api_key: str             # raw key — shown ONCE
    key_prefix: str
    scopes: list[str]
    created_at: str

class KeyInfo(BaseModel):    # key_hash excluded — never exposed
    id: str
    name: str
    key_prefix: str
    scopes: list[str]
    status: str
    created_at: str
    revoked_at: str | None

# Graph schemas
class CreateGraphRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    schema_json: dict = Field(default_factory=dict)

class UpdateGraphRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    schema_json: dict

class GraphResponse(BaseModel):
    id: str
    name: str
    schema_json: dict
    owner_id: str
    created_at: str
    updated_at: str
```

Pydantic models give us: input validation (min/max length), OpenAPI schema generation, automatic serialization, and `key_hash` is never accidentally exposed because it's not in `KeyInfo`.

---

## Engineering Review — Issues & Decisions

### Issue 1: `owner_id` on `runs` is denormalized

Runs have `graph_id` → graph has `owner_id`. Duplicating saves a JOIN.

**Keep it.** SSE streaming (Phase 3) reads runs heavily. Write-time cost negligible.

### Issue 2: Sharing a key = sharing data

If Key A is given to two people, both see and modify the same graphs. No way to distinguish who did what.

**Accept.** This is the standalone key model. Audit logging (who-used-which-key-when) is out of scope. When user accounts arrive with Firebase, each person gets their own identity.

### Issue 3: `owner_id=None` as "no filter" is implicit trust

Admin path passes `None` to bypass tenant isolation.

**Mitigations**: Code comment on every CRUD function. Tests explicitly verify isolation. Route layer is small and auditable.

### Issue 4: `update_graph` returns `created_at=""`

Pre-existing Phase 1 bug. **Fix**: Re-read row after update (like `update_run` does).

### Issue 5: Key revocation orphans data

Revoking a key makes its graphs inaccessible. No other key can reach them.

**Accept for now.** Admin can see orphaned graphs. Future: add key transfer or admin reassignment endpoint.

### Issue 6: CLI requires DB access

CLI runs sync sqlite3 directly. Only works where you have filesystem access to the DB.

**Acceptable for dev/self-hosted.** Docker exec works. Managed deployments would need a different bootstrap.

### Issue 7: CORS must explicitly allow `X-API-Key` header

Current `allow_headers=["*"]` may not pass `X-API-Key` in browser preflight (OPTIONS). Custom headers need explicit listing for CORS to work with the canvas frontend.

**Fix**: Change to `allow_headers=["Content-Type", "X-API-Key"]`. Revisit when Firebase adds `Authorization` header.

### Issue 8: Use `fastapi.security.APIKeyHeader`

FastAPI ships a built-in `APIKeyHeader` class for custom header auth. Using it gives: auto 401 with `WWW-Authenticate: APIKey` header, OpenAPI/Swagger "Authorize" button integration, less manual code.

**Fix**: Use `APIKeyHeader(name="X-API-Key")` as the first dependency in the auth chain. It extracts the header and auto-rejects if missing.

### Issue 9: Route tests need manual app state setup

`httpx.AsyncClient` + `ASGITransport` does NOT run `lifespan`. Test fixture must manually create DB, set `app.state.db`, and clean up.

### Issue 10: Existing v1 database from Phase 1

Migration 002 drops tables silently. **Fix**: Log a warning during destructive migration so it's not a surprise.

### Issue 11: CLI entry point

`uv run python -m app.cli` needs `if __name__ == "__main__"` with argparse subcommands (`create-key`, `list-keys`, `revoke-key`).

### Issue 12: Last admin key revocation = lockout

If the only active admin-scoped key is revoked, all key management endpoints become inaccessible.

**Fix**: Revoke endpoint checks if this is the last active admin key. If so, return 409 Conflict: "Cannot revoke the last admin key." CLI `create-key` is the escape hatch if lockout does occur.

---

## Part A: Database Changes

### A1. Migration `app/db/migrations/002_auth.py`

`VERSION = 2`. Pre-production wipe — drops and recreates all tables.

```python
def up(db):
    # ⚠️ PRE-PRODUCTION ONLY. Future migrations MUST be additive.
    db.execute("DROP TABLE IF EXISTS runs")
    db.execute("DROP TABLE IF EXISTS graphs")

    # New: api_keys
    db.execute("""CREATE TABLE api_keys (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        key_hash TEXT NOT NULL UNIQUE,
        key_prefix TEXT NOT NULL,
        scopes TEXT NOT NULL,           -- JSON array
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL,
        revoked_at TEXT
    )""")
    db.execute("CREATE INDEX idx_api_keys_hash ON api_keys(key_hash)")

    # Recreated: graphs + runs with owner_id
    # ... (same columns as 001 + owner_id TEXT NOT NULL)
    db.execute("CREATE INDEX idx_graphs_owner ON graphs(owner_id)")
    db.execute("CREATE INDEX idx_runs_owner ON runs(owner_id)")
    db.execute("CREATE INDEX idx_runs_graph ON runs(graph_id)")
```

### A2. Model `ApiKey` in `app/db/models.py`

```python
@dataclass
class ApiKey:
    id: str
    name: str
    key_hash: str
    key_prefix: str       # first 10 chars for display
    scopes: list[str]     # ["graphs:read", ...]
    status: str           # active | revoked
    created_at: str
    revoked_at: str | None = None
```

Add `owner_id: str = ""` to `Graph` and `Run`.

### A3. New file `app/db/crud_auth.py`

```
create_api_key(db, name, key_hash, key_prefix, scopes) -> ApiKey
get_api_key_by_hash(db, key_hash) -> ApiKey | None
get_api_key(db, key_id) -> ApiKey | None
list_api_keys(db) -> list[ApiKey]
count_active_admin_keys(db) -> int    # for last-admin-key guard
revoke_api_key(db, key_id) -> ApiKey | None
```

### A4. Update `app/db/crud.py`

Add `owner_id: str | None = None` to all graph/run functions. Fix `update_graph` to re-read row.

---

## Part B: Auth Module

### B1. `app/auth/__init__.py` — scope constants

```python
SCOPES_DEFAULT = ["graphs:read", "graphs:write", "runs:read", "runs:write"]
SCOPES_ADMIN = [*SCOPES_DEFAULT, "admin"]
ALL_SCOPES = set(SCOPES_ADMIN)

def validate_scopes(scopes: list[str]) -> None:
    """Raise ValueError if any scope is not in ALL_SCOPES."""
```

### B2. `app/auth/keys.py` — key generation + hashing

```python
generate_api_key() -> tuple[str, str]    # ("gw_" + 64 hex, SHA-256 hash)
hash_key(raw_key: str) -> str            # SHA-256 hex digest
get_key_display_prefix(raw_key: str) -> str  # first 10 chars
```

### B3. `app/auth/deps.py` — FastAPI dependencies

```python
from fastapi.security import APIKeyHeader

api_key_header = APIKeyHeader(name="X-API-Key")

@dataclass
class AuthContext:
    owner_id: str        # api_key.id
    scopes: list[str]
    key_name: str

    @property
    def is_admin(self) -> bool:
        return "admin" in self.scopes

async def require_auth(
    raw_key: str = Depends(api_key_header),   # auto 401 if missing
    db = Depends(get_db),
) -> AuthContext:
    # hash → lookup → 401 if not found or revoked
    # Returns AuthContext

def require_scope(scope: str):
    """Returns a dependency that checks scope in auth.scopes."""
    async def _check(auth: AuthContext = Depends(require_auth)) -> AuthContext:
        if scope not in auth.scopes:
            raise HTTPException(403, f"Missing required scope: {scope}")
        return auth
    return _check

require_admin = require_scope("admin")
```

### B4. `app/cli.py` — key management CLI

```bash
# Create admin key (bootstrap)
uv run python -m app.cli create-key --name "admin" --scopes all

# Create scoped key
uv run python -m app.cli create-key --name "CI" --scopes graphs:read,graphs:write

# List all keys
uv run python -m app.cli list-keys

# Revoke a key
uv run python -m app.cli revoke-key KEY_ID
```

Uses sync sqlite3. Runs migrations first to ensure schema. `--scopes all` expands to `SCOPES_ADMIN`.

---

## Part C: Pydantic Schemas — `app/schemas/`

New `app/schemas/` package with request/response models.

### `app/schemas/auth.py`

```python
class CreateKeyRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    scopes: list[str]

class CreateKeyResponse(BaseModel):
    id: str
    name: str
    api_key: str           # raw key, shown ONCE
    key_prefix: str
    scopes: list[str]
    created_at: str

class KeyInfo(BaseModel):  # key_hash never exposed
    id: str
    name: str
    key_prefix: str
    scopes: list[str]
    status: str
    created_at: str
    revoked_at: str | None = None
```

### `app/schemas/graphs.py`

```python
class CreateGraphRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    schema_json: dict = Field(default_factory=dict)

class UpdateGraphRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    schema_json: dict

class GraphResponse(BaseModel):
    id: str
    name: str
    schema_json: dict
    owner_id: str
    created_at: str
    updated_at: str
```

### `app/schemas/common.py`

```python
class SuccessResponse(BaseModel):
    success: bool = True

class ErrorResponse(BaseModel):
    success: bool = False
    detail: str
```

Routes use `response_model` parameter for OpenAPI docs and type-safe serialization:
```python
@router.post("/graphs", response_model=SuccessResponse)
```

Dataclass → Pydantic conversion happens in routes via explicit field mapping (not `dataclasses.asdict()`) to ensure `key_hash` is never included.

---

## Part D: Auth Routes — `app/routes/auth.py`

All key management requires `admin` scope.

| Route | Scope | Body | Response Model | Notes |
|-------|-------|------|----------------|-------|
| `POST /auth/keys` | admin | `CreateKeyRequest` | `CreateKeyResponse` | raw key shown once |
| `GET /auth/keys` | admin | — | `list[KeyInfo]` | key_hash excluded |
| `DELETE /auth/keys/{id}` | admin | — | `KeyInfo` | 409 if last admin key |

Scope validation: requested scopes must be a subset of `ALL_SCOPES`. Reject unknown scopes with 422 (Pydantic validator).

---

## Part E: Graph Routes — `app/routes/graphs.py`

| Route | Scope | Body | Response Model |
|-------|-------|------|----------------|
| `POST /graphs` | graphs:write | `CreateGraphRequest` | `GraphResponse` |
| `GET /graphs` | graphs:read | — | `list[GraphResponse]` |
| `GET /graphs/{id}` | graphs:read | — | `GraphResponse` |
| `PUT /graphs/{id}` | graphs:write | `UpdateGraphRequest` | `GraphResponse` |
| `DELETE /graphs/{id}` | graphs:write | — | `SuccessResponse` |

404 for wrong owner (prevents enumeration).

---

## Part F: Update `app/main.py`

1. `app.include_router(auth_router)` and `app.include_router(graphs_router)`
2. Add `RateLimitExceeded` exception handler
3. `/health` gains `auth_configured: bool` (any keys exist in DB — uses `Depends(get_db)`)
4. CORS: change `allow_headers` to `["Content-Type", "X-API-Key"]`
5. Create `app/routes/__init__.py` and `app/schemas/__init__.py`

---

## Part G: Tests

### `tests/conftest.py` — shared fixtures
- `db` fixture (moved from test_crud.py)
- `create_test_key(db, scopes)` helper → (ApiKey, raw_key)
- `client` fixture for route tests — creates DB, sets `app.state.db`, yields `httpx.AsyncClient`

### `tests/unit/test_auth_keys.py` (5 tests)
- Key format: starts with `gw_`, 67 chars
- Two calls produce unique keys
- Hash is deterministic
- Different keys → different hashes
- Prefix is first 10 chars

### `tests/unit/test_crud_auth.py` (8 tests)
- Create + get by hash
- Get by hash not found → None
- List all keys
- Get by ID
- Revoke sets status + revoked_at
- Revoke nonexistent → None
- Scopes stored and retrieved as list
- count_active_admin_keys returns correct count

### `tests/unit/test_auth_deps.py` (6 tests)
- No header → 401
- Invalid token → 401
- Revoked key → 401
- Valid key → AuthContext with correct owner_id + scopes
- require_scope with valid scope → passes
- require_scope with missing scope → 403

### Update `tests/unit/test_crud.py`
- All calls gain `owner_id` param
- New: owner isolation (create as key A, query as key B → None)
- New: admin (owner_id=None) sees all

### Update `tests/unit/test_migrations.py`
- Check `api_keys` table exists
- Assert version = 2

### `tests/unit/test_routes.py` (~14 integration tests)
Uses `httpx.AsyncClient` + `ASGITransport(app)`:
- Create key via API (admin) — response matches `CreateKeyResponse` schema
- Create key with unknown scope → 422
- List keys (admin) — response excludes key_hash
- Non-admin can't create keys → 403
- Revoke key, use it → 401
- Revoke last admin key → 409
- CRUD graphs (create, list, get, update, delete) — responses match `GraphResponse`
- Owner isolation (two keys, each sees only own)
- Admin sees all graphs
- Wrong scope → 403
- Unauthenticated → 401
- Invalid request body → 422 (Pydantic validation)

---

## Files Summary

| Action | File |
|--------|------|
| **create** | `app/db/migrations/002_auth.py` |
| **create** | `app/db/crud_auth.py` |
| **create** | `app/auth/__init__.py` |
| **create** | `app/auth/keys.py` |
| **create** | `app/auth/deps.py` |
| **create** | `app/cli.py` |
| **create** | `app/schemas/__init__.py` |
| **create** | `app/schemas/common.py` |
| **create** | `app/schemas/auth.py` |
| **create** | `app/schemas/graphs.py` |
| **create** | `app/routes/__init__.py` |
| **create** | `app/routes/auth.py` |
| **create** | `app/routes/graphs.py` |
| **create** | `tests/conftest.py` |
| **create** | `tests/unit/test_auth_keys.py` |
| **create** | `tests/unit/test_crud_auth.py` |
| **create** | `tests/unit/test_auth_deps.py` |
| **create** | `tests/unit/test_routes.py` |
| **modify** | `app/db/models.py` — add ApiKey, owner_id to Graph/Run |
| **modify** | `app/db/crud.py` — owner_id params, fix update_graph |
| **modify** | `app/main.py` — routers, rate limit handler, health, CORS |
| **modify** | `tests/unit/test_crud.py` — owner_id, isolation tests |
| **modify** | `tests/unit/test_migrations.py` — v2, api_keys table |
| **modify** | `.env.example` — CLI bootstrap instructions |

---

## Verification

```bash
cd packages/execution
uv run ruff check app/ tests/
uv run ruff format --check app/ tests/
uv run pytest tests/unit/ -v
```

Manual:
```bash
# 1. Bootstrap admin key
uv run python -m app.cli create-key --name admin --scopes all
# → gw_abc123...

# 2. Start server
pnpm dev:exec

# 3. Health check
curl localhost:8000/health
# → { "status": "ok", "auth_configured": true }

# 4. OpenAPI docs — verify Authorize button works
open http://localhost:8000/docs

# 5. Create a scoped key via API
curl -X POST localhost:8000/auth/keys \
  -H "X-API-Key: gw_<admin-key>" \
  -H "Content-Type: application/json" \
  -d '{"name":"dev","scopes":["graphs:read","graphs:write"]}'
# → { "success": true, "data": { "api_key": "gw_...", ... } }

# 6. Create graph with scoped key
curl -X POST localhost:8000/graphs \
  -H "X-API-Key: gw_<dev-key>" \
  -H "Content-Type: application/json" \
  -d '{"name":"My Graph"}'

# 7. List — dev key sees own, admin sees all
curl localhost:8000/graphs -H "X-API-Key: gw_<dev-key>"
curl localhost:8000/graphs -H "X-API-Key: gw_<admin-key>"

# 8. Pydantic validation — invalid request
curl -X POST localhost:8000/graphs \
  -H "X-API-Key: gw_<dev-key>" \
  -H "Content-Type: application/json" \
  -d '{"name":""}'
# → 422 with validation error

# 9. Revoke key, retry → 401
curl -X DELETE localhost:8000/auth/keys/<key-id> \
  -H "X-API-Key: gw_<admin-key>"
curl localhost:8000/graphs -H "X-API-Key: gw_<dev-key>"
# → 401
```

---

## Not in Scope

- JWT / Firebase / OAuth (future: when canvas wires in)
- User accounts table (key = identity for now)
- Key expiration / TTL
- Key rotation endpoint
- Frontend auth UI
- Audit logging
- Rate limiting on authenticated routes (IP-based rate limiting already exists)
