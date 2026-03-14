---
name: gw-api-design
description: "REST endpoint design patterns for FastAPI: response envelopes, Pydantic request/response models, pagination, HTTP status codes, endpoint naming, API versioning, OpenAPI auto-generation, rate limiting headers. Load when designing new API endpoints, adding routes, or defining request/response schemas."
disable-model-invocation: true
---

# Skill: API Design

Load this when: designing new API endpoints, adding routes, defining
request/response schemas, or deciding on HTTP status codes and response formats.
Also load gw-execution — it documents existing routes and auth.

---

## Endpoint naming

- **Nouns, not verbs**: `/v1/graphs`, not `/v1/getGraphs`
- **Plural resources**: `/v1/graphs`, `/v1/runs`, `/v1/auth/keys`
- **Nested for ownership**: `/v1/graphs/{id}/run` (run belongs to graph)
- **Actions as sub-resources**: `/v1/graphs/{id}/validate`, `/v1/graphs/{id}/export`
- **All business routes versioned**: `/v1/` prefix via `APIRouter(prefix="/v1/...")`
- **System routes unversioned**: `/health`, `/settings/providers`

## HTTP method + status code conventions

```
POST   /v1/things          → 201 Created   (return created resource)
GET    /v1/things           → 200 OK        (return paginated list)
GET    /v1/things/{id}      → 200 OK        (return single resource)
PUT    /v1/things/{id}      → 200 OK        (return updated resource)
DELETE /v1/things/{id}      → 204 No Content (empty body)
```

Error codes:
```
400  Bad Request         — malformed input that Pydantic can't catch
401  Unauthorized        — missing or invalid API key
403  Forbidden           — valid key, insufficient scope
404  Not Found           — resource doesn't exist or not owned by caller
409  Conflict            — business rule violation (e.g., revoking last admin key)
415  Unsupported Media   — non-JSON Content-Type on POST/PUT/PATCH
422  Unprocessable       — Pydantic validation failure (FastAPI default)
429  Too Many Requests   — rate limit exceeded
500  Internal Server     — unhandled exception (never leak stack traces)
```

## Request models (Pydantic)

```python
from pydantic import BaseModel, Field

class CreateGraphRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    schema_json: dict  # validated as GraphSchema downstream

class UpdateGraphRequest(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    schema_json: dict | None = None
```

Rules:
- All request bodies are Pydantic `BaseModel` subclasses
- Use `Field(...)` for required fields with constraints
- Optional update fields: `field: Type | None = None`
- Place in `app/schemas/` — one file per domain (auth.py, graphs.py)
- Never reuse request models as response models

## Response models (Pydantic)

```python
class GraphResponse(BaseModel):
    id: str
    name: str
    owner_id: str
    created_at: str
    updated_at: str

    model_config = ConfigDict(from_attributes=True)
```

Rules:
- Flat structure — no nested envelopes for single resources
- `model_config = ConfigDict(from_attributes=True)` for ORM/dataclass compat
- Never expose internal fields (key_hash, raw passwords)
- Timestamps as ISO 8601 strings

## Error response format

```python
# All error responses use this shape
{
    "detail": "Graph not found",       # human-readable message
    "status_code": 404                 # mirrors HTTP status
}

# Validation errors (422) — detail is a list
{
    "detail": [
        {"loc": ["body", "name"], "msg": "field required", "type": "missing"}
    ],
    "status_code": 422
}
```

Implemented via custom exception handlers in `main.py` that catch
`HTTPException`, `RequestValidationError`, and `RateLimitExceeded`.

## Pagination

```python
class PaginatedResponse(BaseModel, Generic[T]):
    items: list[T]
    total: int          # total matching records
    limit: int          # requested page size
    offset: int         # requested offset
    has_more: bool      # convenience: offset + limit < total
```

Query params: `?limit=20&offset=0` (defaults: limit=20, offset=0, max limit=100).

```python
@router.get("/v1/graphs")
async def list_graphs(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    auth: AuthContext = Depends(require_auth),
    db = Depends(get_db),
):
    owner_id = None if "admin" in auth.scopes else auth.owner_id
    graphs, total = await list_graphs_db(db, owner_id=owner_id, limit=limit, offset=offset)
    return PaginatedResponse(
        items=graphs, total=total, limit=limit, offset=offset,
        has_more=offset + limit < total,
    )
```

## Tool response pattern

All tools return this shape — consumed by the executor, not the HTTP layer:

```python
# Success
{"success": True, "result": {...}, "recoverable": True}

# Failure — recoverable (LLM can retry with different inputs)
{"success": False, "error": "Division by zero", "recoverable": True}

# Failure — not recoverable (tool is broken, skip it)
{"success": False, "error": "SSRF blocked", "recoverable": False}
```

## Rate limiting headers

SlowAPI adds these automatically when `headers_enabled=True`:

```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 58
X-RateLimit-Reset: 1709312400
Retry-After: 42          # only on 429 responses
```

## OpenAPI

FastAPI auto-generates OpenAPI from route signatures and Pydantic models.
No manual spec files.

- Tags group endpoints: `tags_metadata` in `main.py`
- `response_model` on routes for typed responses
- `status_code` on routes for correct default
- Docs at `/docs` (Swagger) and `/redoc` (ReDoc)

```python
@router.post("/v1/graphs", response_model=GraphResponse, status_code=201,
             tags=["graphs"])
async def create_graph(body: CreateGraphRequest, ...):
    ...
```

## Checklist for new endpoints

1. Define Pydantic request + response models in `app/schemas/`
2. Add route in appropriate `app/routes/` file
3. Set correct `status_code` and `response_model`
4. Add auth dependency: `Depends(require_auth)` or `Depends(require_scope("admin"))`
5. Use owner_id filtering for tenant isolation
6. Paginate list endpoints
7. Return proper error codes — never 200 with error body
