---
name: gw-architecture
description: "Monorepo structure, Docker setup, dev workflow, Biome config, TypeScript path alias layer enforcement, and dependency management (pnpm + uv). Load when making structural decisions, adding packages, touching Docker config, setting up new files, or when unsure where something belongs in the project."
disable-model-invocation: true
---

# Skill: Architecture

Load this when: making structural decisions, adding packages, touching
Docker config, setting up new files, or when unsure where something belongs.

---

## Monorepo structure

```
prosdevlab/graphweave/
├── packages/
│   ├── canvas/          # React 19 frontend (Vite)
│   ├── sdk-core/        # Plugin SDK — zero @graphweave/* imports
│   ├── shared/          # GraphSchema TypeScript types
│   └── execution/       # Python FastAPI + LangGraph
├── docs/                # Nextra documentation site
├── docker-compose.yml          # production — builds from Dockerfile
├── docker-compose.dev.yml      # dev — mounts source, uvicorn --reload
├── turbo.json
├── pnpm-workspace.yaml
├── CLAUDE.md
├── CONTRIBUTING.md
└── .env.example
```

## Prerequisites (contributors need all four)

```
Node.js 20+   https://nodejs.org
pnpm 9+       npm install -g pnpm
uv            https://docs.astral.sh/uv/getting-started/installation
Docker        https://docs.docker.com/get-docker
```

## Root package.json

```json
{
  "packageManager": "pnpm@9.x.x",
  "engines": { "node": ">=20" }
}
```

## pnpm-workspace.yaml

```yaml
packages:
  - "packages/*"
  - "docs"
```

## turbo.json pipeline

```json
{
  "pipeline": {
    "build":     { "dependsOn": ["^build"], "outputs": ["dist/**"] },
    "typecheck": { "dependsOn": ["^build"] },
    "lint":      {},
    "format":    {},
    "test":      { "dependsOn": ["^build"] },
    "dev":       { "cache": false, "persistent": true }
  }
}
```

## Biome (formatting + linting)

Biome replaces ESLint and Prettier. One tool, zero config needed beyond
the root `biome.json`.

```json
{
  "$schema": "https://biomejs.dev/schemas/1.x.x/schema.json",
  "organizeImports": { "enabled": true },
  "linter": {
    "enabled": true,
    "rules": { "recommended": true }
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2
  }
}
```

```bash
# Check (CI)
pnpm biome check .

# Fix (local)
pnpm biome check --write .
```

Biome does not enforce custom import rules. Layer boundary enforcement
is handled by TypeScript path aliases instead (see below).

## TypeScript path aliases — layer boundary enforcement

Components can only import from `@store`, `@ui`, and `@shared` path aliases.
They cannot import from `@api` directly. `tsc --noEmit` enforces this — if a
component imports from `@api`, TypeScript will error because `@api` is not in
the component layer's allowed paths.

```json
// packages/canvas/tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "paths": {
      "@store/*":  ["./src/store/*"],
      "@ui/*":     ["./src/components/ui/*"],
      "@shared/*": ["../../packages/shared/src/*"],
      "@api/*":    ["./src/api/*"]
    }
  }
}
```

The constraint: `src/components/` files only use `@store/*` and `@ui/*`
imports. They never reference `@api/*` directly. Any component that
needs data calls a store action — the store calls the API layer.

For `sdk-core`, the constraint is in `tsconfig.json` `paths` — no
`@graphweave/*` aliases are defined in its tsconfig, so any attempt to
import from `@graphweave/shared` or `@graphweave/canvas` will fail at
typecheck time.

## Dev workflow

```bash
pnpm dev   # starts Vite dev server + Docker dev container via concurrently
```

`docker-compose.dev.yml` mounts source — Python changes hot-reload in <1s.
Never run FastAPI directly outside Docker. Environment drift is the risk.

## Docker — dev vs production

```yaml
# docker-compose.yml (production — builds from Dockerfile)
services:
  execution:
    build: ./packages/execution
    ports: ["8000:8000"]
    volumes:
      - ./data:/data    # SQLite survives container removal

# docker-compose.dev.yml (dev — hot reload)
services:
  execution:
    image: python:3.13-slim
    working_dir: /app
    volumes:
      - ./packages/execution:/app
      - ./data:/data
    command: >
      sh -c "pip install uv && uv sync &&
        uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"
    env_file: ./packages/execution/.env
```

Start dev execution only: `pnpm dev:exec`

## Python dependency management (uv)

```bash
# Add a dependency
uv add langgraph

# Install from lockfile (dev)
uv sync

# Install from lockfile exactly (CI + Docker)
uv sync --frozen

# uv.lock is committed to the repo
```

## Dockerfile pattern

```dockerfile
FROM python:3.13-slim
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev   # --frozen fails if lockfile is stale
COPY app/ ./app/
CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

`--frozen` means the build fails if `pyproject.toml` changed without
running `uv lock`. Catches drift early.

## .env.example (all vars documented)

```bash
# Required: at least one LLM provider
GEMINI_API_KEY=           # aistudio.google.com
OPENAI_API_KEY=           # platform.openai.com

# Optional
ANTHROPIC_API_KEY=        # anthropic.com (v0.4+)
TAVILY_API_KEY=           # app.tavily.com — web_search uses DDG fallback if not set
LANGSMITH_API_KEY=        # LangSmith observability (v0.4+)
LOG_LEVEL=INFO
RATE_LIMIT_PER_MINUTE=10
```

## FastAPI startup (main.py)

```python
# Lifespan — replaces deprecated @app.on_event("startup")
@asynccontextmanager
async def lifespan(app):
    # LLM keys: warn, don't crash
    # DB: init_db() → app.state.db
    yield
    # close_db()

app = FastAPI(lifespan=lifespan, openapi_tags=tags_metadata)

# Auth — X-API-Key header via fastapi.security.APIKeyHeader
# All /v1/* routes require auth. /health and /settings stay open.
# Bootstrap: uv run python -m app.cli create-key --name admin --scopes all

# CORS — explicit origins and headers
app.add_middleware(CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_headers=["Content-Type", "X-API-Key", "X-Request-ID"],
    expose_headers=["X-Request-ID"],
)

# Middleware stack (bottom-up: last added runs first)
app.add_middleware(RequestIDMiddleware)   # X-Request-ID
app.add_middleware(ContentTypeMiddleware) # 415 on non-JSON POST/PUT/PATCH

# Rate limiting — 60/min default, headers enabled
limiter = Limiter(key_func=get_remote_address, default_limits=["60/minute"],
                  headers_enabled=True)
```

## API versioning

- All business routes: `/v1/auth/*`, `/v1/graphs/*`
- System routes (unversioned): `/health`, `/settings/providers`
- Routers set prefix: `APIRouter(prefix="/v1/graphs")`

## Response patterns

```python
# Success — flat, typed, proper HTTP codes
# POST → 201, GET/PUT → 200, DELETE → 204 (empty body)
# Lists → PaginatedResponse { items, total, limit, offset, has_more }

# Errors — envelope with status_code in body
# { "detail": "...", "status_code": 404 }
# Custom exception handlers for HTTPException, RequestValidationError, RateLimitExceeded
```

## Structured logging

```python
class JSONFormatter(logging.Formatter):
    def format(self, record):
        return json.dumps({
            "ts": self.formatTime(record),
            "level": record.levelname,
            "request_id": getattr(record, "request_id", None),
            "run_id": getattr(record, "run_id", None),
            "node_id": getattr(record, "node_id", None),
            "msg": record.getMessage(),
        })

# Debug in production:
# docker logs graphweave-execution | jq 'select(.request_id=="abc123")'
```
