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
    image: python:3.11-slim
    working_dir: /app
    volumes:
      - ./packages/execution:/app
      - ./data:/data
    command: uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
    env_file: ./packages/execution/.env
```

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
FROM python:3.11-slim
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
# Startup validation — fails fast with clear messages
for key in ["GEMINI_API_KEY"]:   # at least one provider required
    if not os.getenv(key):
        raise RuntimeError(f"{key} not set. See .env.example.")

# CORS — explicit, not wildcard
app.add_middleware(CORSMiddleware,
    allow_origins=["http://localhost:3000"],
)

# Rate limiting — per-IP on run endpoint
@app.post("/graphs/{id}/run")
@limiter.limit("10/minute")
async def run_graph(request: Request, ...): ...
```

## Structured logging

```python
class JSONFormatter(logging.Formatter):
    def format(self, record):
        return json.dumps({
            "ts": self.formatTime(record),
            "level": record.levelname,
            "run_id": getattr(record, "run_id", None),
            "node_id": getattr(record, "node_id", None),
            "msg": record.getMessage(),
        })

# Debug in production:
# docker logs graphweave-execution | jq 'select(.run_id=="abc123")'
```
