---
name: gw-security
description: "Security patterns for graphweave: API key auth internals (hashing, timing-safe comparison, rotation), Pydantic input validation, secrets management (.env only), CORS configuration, rate limiting, security headers, SSRF prevention, and common anti-patterns. Load when implementing auth, handling secrets, configuring CORS, validating input, or reviewing security."
disable-model-invocation: true
---

# Skill: Security

Load this when: implementing auth, handling secrets, configuring CORS/headers,
validating user input, adding URL fetching, or reviewing code for security.
Also load gw-execution for auth implementation details.

---

## API key authentication

### Key lifecycle

```
create-key CLI → generate raw key (gw_...) → SHA-256 hash → store hash in DB
                 ↓
                 show raw key once → user stores in .env
                 ↓
API request → X-API-Key header → SHA-256 hash → lookup by hash → AuthContext
```

### Key format

```python
# app/auth/keys.py
import secrets

def generate_api_key() -> str:
    """Generate a key with gw_ prefix. 32 random bytes = 43 base64 chars."""
    return f"gw_{secrets.token_urlsafe(32)}"

def hash_key(raw_key: str) -> str:
    """SHA-256 hash for storage. Never store raw keys."""
    return hashlib.sha256(raw_key.encode()).hexdigest()
```

### Timing-safe comparison

```python
# In auth dependency — prevent timing attacks on key lookup
import hmac

# Don't do string comparison: if stored_hash == provided_hash
# Do use constant-time comparison:
hmac.compare_digest(stored_hash, provided_hash)
```

Note: Our current implementation looks up by hash (DB query), which is
inherently constant-time since the DB does the comparison. But if you ever
compare hashes in Python code, always use `hmac.compare_digest`.

### Scope enforcement

```python
# Scopes are stored as comma-separated in DB, parsed to list
SCOPES_DEFAULT = ["graphs:read", "graphs:write", "runs:read", "runs:write"]
SCOPES_ADMIN = [*SCOPES_DEFAULT, "admin"]

# require_scope returns a FastAPI dependency
# Usage: auth = Depends(require_scope("graphs:write"))
# Returns 403 if scope missing from key's scope list
```

### Key rotation

To rotate a key without downtime:
1. Create new key via CLI: `uv run python -m app.cli create-key --name "service-v2" --scopes ...`
2. Update `.env` with new key
3. Verify new key works
4. Revoke old key: `uv run python -m app.cli revoke-key OLD_KEY_ID`

Revoked keys return 401 immediately — `status="revoked"` checked in auth dep.

## Input validation

### Pydantic as the validation boundary

All user input enters through Pydantic models. FastAPI handles validation
automatically — invalid input returns 422 before route code runs.

```python
class CreateGraphRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    schema_json: dict  # raw dict, validated as GraphSchema in business logic

# FastAPI validates automatically:
@router.post("/v1/graphs")
async def create_graph(body: CreateGraphRequest):  # ← validated before this runs
    ...
```

### GraphSchema validation

GraphSchema is validated before execution, not just at API input:

```python
# Before running a graph, validate the schema structure:
# - All node IDs referenced in edges exist
# - Entry point exists
# - No orphaned nodes
# - Tool nodes reference registered tools
# - LLM nodes have valid provider config
```

### Path parameter validation

```python
# Use Path() for constraints on URL params
@router.get("/v1/graphs/{graph_id}")
async def get_graph(graph_id: str = Path(..., min_length=1)):
    ...
```

## Secrets management

### Rules (non-negotiable)

- **API keys live in `.env` only** — never in browser storage, never in code
- `.env` is in `.gitignore` — never committed
- `.env.example` documents all variables without values
- `docker-compose.dev.yml` uses `env_file: ./packages/execution/.env`
- Production: use Docker secrets or environment variables from CI/CD

### What goes in `.env`

```bash
# LLM provider keys
GEMINI_API_KEY=
OPENAI_API_KEY=
ANTHROPIC_API_KEY=

# Optional services
TAVILY_API_KEY=
LANGSMITH_API_KEY=

# App config (not secrets, but environment-specific)
LOG_LEVEL=INFO
RATE_LIMIT_PER_MINUTE=60
```

### Never do this

```python
# ❌ Hardcoded secret
API_KEY = "gw_abc123..."

# ❌ Secret in browser localStorage
localStorage.setItem("apiKey", key)

# ❌ Secret in frontend code
const API_KEY = import.meta.env.VITE_API_KEY  # Vite exposes VITE_ vars to browser

# ❌ Secret in git
# .env committed to repo

# ✅ Server-side only, from environment
import os
api_key = os.getenv("OPENAI_API_KEY")
```

## CORS configuration

```python
# main.py — explicit origins, not wildcards
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",   # Vite dev server
        "http://localhost:5173",   # Vite alt port
    ],
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "X-API-Key", "X-Request-ID"],
    expose_headers=["X-Request-ID"],  # client can read this
    allow_credentials=False,          # no cookies — API key auth only
)
```

Rules:
- **Dev**: localhost origins for Vite dev server
- **Prod**: canvas domain only — never `allow_origins=["*"]`
- `allow_credentials=False` — we use API key auth, not cookies
- Explicitly list allowed headers — don't use `["*"]`

## Rate limiting

```python
# SlowAPI setup in main.py
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(
    key_func=get_remote_address,       # per-IP by default
    default_limits=["60/minute"],
    headers_enabled=True,              # X-RateLimit-* headers
)

# Per-route override for expensive operations
@router.post("/v1/graphs/{id}/run")
@limiter.limit("10/minute")            # stricter for graph execution
async def run_graph(...):
    ...
```

Rate limit headers (automatic):
```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 57
X-RateLimit-Reset: 1709312400
Retry-After: 42              # only on 429
```

Future: per-key rate limiting (use key ID as key_func instead of IP).

## Security headers

```python
# FastAPI middleware for security headers
@app.middleware("http")
async def security_headers(request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Cache-Control"] = "no-store"          # API responses
    response.headers["Strict-Transport-Security"] = \
        "max-age=31536000; includeSubDomains"                # prod only
    return response
```

## SSRF prevention

The `url_fetch` tool validates URLs before fetching:

```python
# app/tools/url_fetch.py
import ipaddress
from urllib.parse import urlparse

def is_safe_url(url: str) -> bool:
    """Block requests to private/internal networks."""
    parsed = urlparse(url)

    # Must be http or https
    if parsed.scheme not in ("http", "https"):
        return False

    # Resolve hostname to IP
    try:
        ip = ipaddress.ip_address(socket.gethostbyname(parsed.hostname))
    except (socket.gaierror, ValueError):
        return False

    # Block private, loopback, link-local
    if ip.is_private or ip.is_loopback or ip.is_link_local:
        return False

    return True
```

Additional protections:
- `follow_redirects=False` — prevents redirect to internal IPs
- Non-recoverable tool error on SSRF violation
- Timeout on all HTTP requests (10s default)

## Content-Type enforcement

```python
# ContentTypeMiddleware (app/middleware.py)
# Rejects POST/PUT/PATCH without Content-Type: application/json → 415
# Prevents content-type confusion attacks
```

## Anti-patterns checklist

| Don't | Do |
|-------|----|
| `allow_origins=["*"]` in prod | Explicit origin list |
| Store secrets in localStorage | API keys in `.env`, server-side only |
| `VITE_` prefix for secrets | Only non-secret config gets `VITE_` prefix |
| String comparison for hashes | `hmac.compare_digest()` |
| Follow redirects in URL fetch | `follow_redirects=False` |
| Log API keys or user data | Log request_id, levels, generic messages |
| Return stack traces in responses | Generic error message + server-side logging |
| Wildcard CORS headers | Explicit `allow_headers` list |
| Trust user-supplied URLs | Validate scheme, resolve IP, block private ranges |
