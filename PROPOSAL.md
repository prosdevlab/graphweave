# Graphweave — Project Proposal

**prosdevlab/graphweave** · Open Source · MIT License  
*A visual LangGraph agent builder. What you draw is what runs.*

---

## Table of Contents

1. [Vision & Positioning](#1-vision--positioning)
2. [Problem Statement](#2-problem-statement)
3. [Core Principles](#3-core-principles)
4. [Target User](#4-target-user)
5. [Feature Scope](#5-feature-scope)
6. [Architecture](#6-architecture)
7. [Operational Design](#7-operational-design)
8. [GraphSchema Specification](#8-graphschema-specification)
9. [Frontend Tech Stack](#9-frontend-tech-stack)
10. [User Flows](#10-user-flows)
11. [Phased Roadmap](#11-phased-roadmap)
12. [Open Questions](#12-open-questions)

---

## 1. Vision & Positioning

Graphweave is an open source visual builder for LangGraph agents. You drag nodes onto a canvas, connect them with edges, configure conditions and tools in a sidebar — and what you draw executes as a real LangGraph graph. No hidden abstraction layer. No proprietary runtime. The JSON schema you see in the panel is the same structure the Python execution engine receives.

Most visual agent builders (Flowise, Langflow) abstract *away* from LangGraph — they define their own concepts and translate behind the scenes. LangGraph Studio is the closest thing to a native visual tool, but it's closed source and desktop-only. Graphweave fills the gap: an open source, web-based canvas that maps directly to LangGraph's actual primitives, so developers can prototype visually without losing the ability to reason about what their agent is actually doing.

When you're done prototyping, you export runnable Python. You can read the generated code, learn from it, modify it, and deploy it anywhere.

---

## 2. Problem Statement

LangGraph is powerful but text-heavy. Defining a StateGraph in code — nodes, edges, conditional routing, state reducers — requires holding the entire graph topology in your head. For complex agents with 8–12 nodes, branching conditions, and multiple tool integrations, this becomes a significant cognitive load even for experienced developers.

The existing options all have a meaningful cost:

- **LangGraph Studio** — closest to native, but closed source, Mac-only desktop app, requires LangGraph Cloud
- **Flowise / Langflow** — visual, but abstract away LangGraph primitives entirely; what you draw doesn't map to what runs
- **Hand-written code** — maximum control, minimum visibility; topology is implicit, not explicit

There is no open source, web-based tool that lets a LangGraph developer draw a graph and get back real LangGraph code. That's the gap Graphweave fills.

---

## 3. Core Principles

These principles guide every tradeoff in the project. When scope creep arrives — and it will — these are the filter.

**1. What you draw is what runs.**
The canvas is not a UX layer over a different runtime. It's a visual representation of an actual LangGraph StateGraph. Every node, edge, and condition maps directly to a LangGraph concept with no translation layer.

**2. No hidden magic.**
The GraphSchema JSON is always visible. The generated Python export is always readable. A developer should be able to look at either artifact and understand exactly what their agent will do.

**3. LangGraph primitives are first-class.**
State, nodes, edges, conditional routing, human-in-the-loop interrupts, tool calling — these are the building blocks. Graphweave doesn't invent new concepts; it makes LangGraph's concepts visual.

**4. Escape hatches over constraints.**
Where v1 can't express something (complex conditions, custom tools), Graphweave provides an escape hatch (embedded code editor, JSON panel) rather than blocking the user.

**5. Resilience is a feature.**
SSE reconnection, checkpoint-based resume, structured logging, and schema migrations are first-class concerns — not afterthoughts. Production-grade reliability starts in v0.1.

**6. Open source, genuinely.**
MIT license. Every design decision documented. Contributing guide, architecture docs, issue templates. Built to be forkable, not just viewable.

---

## 4. Target User

**Primary: LangGraph-aware developers who want to prototype faster.**

Someone who knows what a StateGraph is, has read the LangGraph docs, and has written at least one agent by hand. They reach for Graphweave when they want to sketch a multi-step agent topology without writing boilerplate, or when they want to explain an agent architecture to a teammate visually.

This is *not* a no-code tool for non-developers. The UI doesn't hide concepts — it visualizes them. A user who doesn't know what a reducer is will find the state panel confusing. That's acceptable; we're not trying to serve that user in v1.

**Secondary: LangGraph learners.**

Someone learning LangGraph who wants to understand the framework visually before (or alongside) writing code. The Python export feature is particularly valuable here — draw an agent, run it, read the generated code to see what LangGraph code it corresponds to.

---

## 5. Feature Scope

### In scope for v1

- Canvas with 6 node types: Start, LLM, Tool, Condition, HumanInput, End
- Edge connections and reconnection (React Flow drag-and-drop)
- Constrained condition types (field equals, field contains, LLM router, tool error, iteration limit)
- Default state model: `messages` as append-only list with inline explanation tooltip
- Settings page: provider status dashboard — shows which keys are configured (read from server), active model selector, "Test connection" button; no key input fields in the browser
- LLM provider keys configured via `.env` only — never stored in or transmitted through the browser
- Run panel: real-time SSE stream showing active node, output, state evolution
- SSE reconnection with exponential backoff and run status recovery
- SQLite persistence (server-side, Docker volume mounted)
- Schema migration system (versioned migrations applied on server startup)
- JSON schema panel (collapsible, CodeMirror, read/write)
- Graph validation before run (client-side + server-side)
- Run history: last 10 runs per graph (timestamp, input, final state, duration, status)
- Built-in tools (8, across 4 categories): `web_search`, `url_fetch`, `wikipedia`, `file_read` (retrieval); `calculator`, `datetime` (computation); `file_write` (persistence); `weather` (retrieval, zero-config demo)
- Export: runnable Python file + `requirements.txt` with inline TODO comments
- 2 example agents: research agent, code reviewer
- Docker Compose (production) + docker-compose.dev.yml (hot reload) for local setup
- Structured JSON logging from execution layer (v0.1)
- CORS configuration, `.env.example`, startup validation for required env vars
- Per-IP rate limiting on `/graphs/run`
- `CLAUDE.md` with codebase context for AI-assisted development
- Nextra documentation site

### In scope for v1.1

- HTTP/API tool builder (define REST endpoints as tools)
- `code_interpreter` tool (RestrictedPython sandbox — explicit escape hatch for operations no built-in tool covers: text processing, regex, CSV parsing, JSON transformation, sorting, anything deterministic that would waste LLM tokens)
- `rss_feed` tool (feedparser, no key — research agent patterns)
- `send_email` tool (dry-run by default, live mode opt-in — first action tool)
- Advanced state definition (custom fields, reducer types: replace, append, merge)
- Embedded condition editor (Monaco, Python function body)
- `routing_model` field on llm_router condition (cheaper model for routing decisions)
- Anthropic Claude provider
- Memory node (SQLite checkpointer for cross-run persistence)
- Docker export (Dockerfile + docker-compose for self-hosting)
- Export dry-run validation (synthetic input test before file generation)
- Minimap, subgraph collapse
- LangSmith observability integration (optional, documented)

### In scope for v2

- One-click GCP Cloud Run deploy (with API key auth header)
- Subgraph node — a compiled graph callable as a single node in a parent graph (LangGraph's native skill composition primitive; a graph built in Graphweave becomes reusable as a node in any other graph)
- `send_slack` tool (action tool, external + irreversible — same dry-run pattern as send_email)
- `database_query` tool (SQL against a connected DB)
- Code tool (Monaco editor, full Python function — define a custom tool inline)
- Multi-user support
- Full run replay (step through a past run)
- sdk-core public API review + extraction to `@prosdev/sdk-core` on npm

### Explicitly out of scope (v1)

- No-code / non-developer UX
- Multi-user or auth system
- Custom tool marketplace
- MCP tool integration (CLI tools are preferred; MCP adds server/connection overhead)
- Mobile layout

---

## 6. Architecture

### Three-Layer Overview

Graphweave has three layers connected by a shared contract (GraphSchema):

```
┌─────────────────────────────────────────────────────────┐
│                    BROWSER                              │
│                                                         │
│   ┌─────────────┐   ┌──────────────┐  ┌─────────────┐  │
│   │   Canvas    │   │  Run Panel   │  │  Settings   │  │
│   │ (React Flow)│   │  (SSE feed)  │  │  (provider  │  │
│   └──────┬──────┘   └──────┬───────┘  │   status)   │  │
│          │                 │          └──────┬──────┘  │
│          │                 │                  │         │
│   ┌──────▼─────────────────▼──────────────────▼──────┐  │
│   │              Zustand Store                       │  │
│   │   graphSlice │ runSlice │ uiSlice                │  │
│   └──────────────────────┬───────────────────────────┘  │
│                          │                              │
│   ┌──────────────────────▼───────────────────────────┐  │
│   │              Service Layer                       │  │
│   │   graphsApi │ runsApi │ sdk-core (Transport)     │  │
│   └──────────────────────┬───────────────────────────┘  │
└──────────────────────────┼──────────────────────────────┘
                           │ HTTP / SSE
┌──────────────────────────┼──────────────────────────────┐
│              DOCKER CONTAINER                           │
│                          │                              │
│   ┌──────────────────────▼───────────────────────────┐  │
│   │           FastAPI (Python)                       │  │
│   │   /graphs  /graphs/run  /graphs/run/:id/stream   │  │
│   │   /graphs/run/:id/resume  /graphs/validate       │  │
│   │   /graphs/run/:id/status  /graphs/:id/export     │  │
│   └──────────────────────┬───────────────────────────┘  │
│                          │                              │
│   ┌──────────────────────▼───────────────────────────┐  │
│   │           LangGraph Execution Engine             │  │
│   │   GraphBuilder → StateGraph → compile → astream  │  │
│   └──────────────────────┬───────────────────────────┘  │
│                          │                              │
│   ┌──────────┐  ┌────────▼──────────┐  ┌────────────┐  │
│   │  SQLite  │  │  Tool Registry    │  │  JSON logs │  │
│   │ (graphs  │  │  8 built-in tools │  │  (stdout)  │  │
│   │  + runs) │  │  4 categories     │  │            │  │
│   └──────────┘  └───────────────────┘  └────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### The Event-Driven Execution Flow

```
User clicks "Run"
│
├─► POST /graphs/{id}/run
│     body: { input: {...}, provider: "gemini", model: "..." }
│     response: { run_id: "abc123" }
│
├─► GET /graphs/run/abc123/stream   (SSE connection opens)
│
│   LangGraph graph starts executing...
│
│   ┌─────────────────────────────────────────────┐
│   │  SSE Events (streamed as graph runs)        │
│   │                                             │
│   │  → run_started    { run_id, timestamp }     │
│   │  → node_started   { nodeId, timestamp }     │
│   │  → node_completed { nodeId, output,         │
│   │                     stateSnapshot,          │
│   │                     duration_ms }           │
│   │  → edge_traversed { from, to,               │
│   │                     conditionResult? }      │
│   │  → graph_completed { finalState,            │
│   │                      duration_ms }          │
│   └─────────────────────────────────────────────┘
│
│   [IF SSE connection drops unexpectedly]
│   → Frontend detects close (not graph_completed)
│   → Marks run as "connection lost"
│   → Auto-retry SSE with exponential backoff (3 attempts)
│   → On reconnect: GET /graphs/run/abc123/status
│   → If completed during disconnect: replay terminal event
│   → If still running: reattach to stream
│   → If server down: "Server unavailable" banner
│
│   [IF human input node is reached]
│   → graph_paused { nodeId, prompt, run_id }
│   → UI shows inline input field on the paused node
│   → User types response, hits Submit
│   → POST /graphs/run/abc123/resume { input: "..." }
│   → Frontend immediately opens new SSE connection
│   → Server waits for SSE before continuing execution
│   → Stream resumes
│
└─► SSE closes on graph_completed or unrecoverable error
```

### Monorepo Structure

```
prosdevlab/graphweave/
├── packages/
│   ├── canvas/                  # React 19 frontend (Vite)
│   │   ├── src/
│   │   │   ├── components/      # UI only — zero API calls, reads store only
│   │   │   │   ├── canvas/      # React Flow nodes, edges, canvas
│   │   │   │   ├── panels/      # Sidebar, run panel, settings, debug
│   │   │   │   └── ui/          # shadcn/ui base components
│   │   │   ├── store/           # Zustand slices
│   │   │   │   ├── graphSlice.ts
│   │   │   │   ├── runSlice.ts   # owns SSE lifecycle + reconnection
│   │   │   │   └── uiSlice.ts    # canvas preferences, panel state
│   │   │   ├── api/             # Service layer + API client
│   │   │   │   ├── client.ts    # Base fetch wrapper (sdk-core Transport)
│   │   │   │   ├── graphs.ts    # Graph CRUD
│   │   │   │   └── runs.ts      # Run + SSE stream + reconnection
│   │   │   └── types/           # Re-exports from @graphweave/shared
│   │   └── package.json
│   │
│   ├── sdk-core/                # Plugin SDK (internal, extractable at v2)
│   │   ├── src/
│   │   │   ├── core.ts          # createSDK() + use() plugin system
│   │   │   └── plugins/
│   │   │       ├── transport/   # HTTP layer with retry, queuing
│   │   │       ├── events/      # Event emitter (wildcard support)
│   │   │       └── storage/     # Multi-backend: localStorage, memory
│   │   │                        # Used for UI prefs (layout, dark mode),
│   │   │                        # NOT for API keys (those are .env only)
│   │   └── package.json         # zero imports from @graphweave/*
│   │
│   ├── shared/                  # GraphSchema TypeScript types
│   │   ├── src/
│   │   │   ├── schema.ts        # GraphSchema, NodeSchema, EdgeSchema
│   │   │   ├── nodes.ts         # Node config types per type
│   │   │   ├── events.ts        # SSE event types
│   │   │   └── migrations.ts    # Schema version + migration types
│   │   └── package.json
│   │
│   └── execution/               # Python FastAPI + LangGraph
│       ├── app/
│       │   ├── main.py          # FastAPI app, CORS, rate limiting, startup validation
│       │   ├── builder.py       # GraphSchema → LangGraph StateGraph
│       │   ├── executor.py      # Run management, SSE streaming, reconnection
│       │   ├── exporter.py      # Python code generation + compile validation
│       │   ├── logging.py       # Structured JSON logging config
│       │   ├── tools/           # Built-in tool registry
│       │   └── db/
│       │       ├── models.py
│       │       └── migrations/  # Numbered migration files
│       │           ├── 001_initial.py
│       │           └── 002_add_run_history.py
│       ├── .env.example         # All env vars documented with descriptions
│       ├── pyproject.toml
│       └── Dockerfile
│
├── docs/                        # Nextra documentation site
├── examples/
│   ├── research-agent/
│   └── code-reviewer/
├── docker-compose.yml           # Production-like: builds from Dockerfile
├── docker-compose.dev.yml       # Dev: mounts source, uvicorn --reload
├── turbo.json
├── pnpm-workspace.yaml
├── CLAUDE.md                    # AI assistant context (schema, layer rules, events)
├── CONTRIBUTING.md
├── ARCHITECTURE.md
└── README.md
```

### Docker Compose — Dev vs Production

A single `docker-compose.yml` rebuild on every Python change is too slow for active development. Two profiles from day one:

```yaml
# docker-compose.yml — production-like, builds from Dockerfile
services:
  execution:
    build: ./packages/execution
    ports: ["8000:8000"]
    volumes:
      - ./data:/data          # SQLite volume mount — data survives container removal

# docker-compose.dev.yml — development, hot reload
services:
  execution:
    image: python:3.11-slim
    working_dir: /app
    volumes:
      - ./packages/execution:/app   # mount source — changes reload instantly
      - ./data:/data
    command: uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
    env_file: ./packages/execution/.env
```

Development workflow: `pnpm dev` in the root starts both the Vite dev server and the Docker dev container via `concurrently`. Python changes hot-reload in under a second. No container rebuilds during active development.

**Risk**: Developers bypass Docker entirely and run FastAPI directly, causing environment drift.
**Mitigation**: `CONTRIBUTING.md` specifies Docker as the only supported local dev path. `docker-compose.dev.yml` is fast enough that there's no incentive to bypass it.

### Structured Logging (v0.1)

Three lines in `logging.py`, enabled from the first commit. Every LangGraph event logged with run ID, node ID, timestamp, and duration. JSON format enables log aggregation tools without code changes later.

```python
import logging, json

class JSONFormatter(logging.Formatter):
    def format(self, record):
        return json.dumps({
            "ts": self.formatTime(record),
            "level": record.levelname,
            "run_id": getattr(record, "run_id", None),
            "node_id": getattr(record, "node_id", None),
            "msg": record.getMessage(),
        })
```

When something goes wrong in production, debugging is structured log queries — not `docker logs | grep`.

### CORS, Environment Variables, Rate Limiting

These are not afterthoughts — they're configured in v0.1:

```python
# main.py — startup validation fails fast with clear messages
required_env = ["GEMINI_API_KEY"]  # or OPENAI_API_KEY if that's the active provider
for key in required_env:
    if not os.getenv(key):
        raise RuntimeError(f"Required env var {key} is not set. See .env.example.")

# CORS — explicit, not wildcard in production
app.add_middleware(CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # dev
    allow_methods=["*"],
    allow_headers=["*"],
)

# Rate limiting — simple per-IP limit on run endpoint
@app.post("/graphs/{id}/run")
@limiter.limit("10/minute")   # slowapi
async def run_graph(request: Request, ...):
    ...
```

`.env.example` is committed to the repo with every variable documented:

```bash
# Required: at least one LLM provider key
GEMINI_API_KEY=           # Google Gemini — get at aistudio.google.com
OPENAI_API_KEY=           # OpenAI — get at platform.openai.com

# Optional
ANTHROPIC_API_KEY=        # Anthropic Claude (v0.4+)
LANGSMITH_API_KEY=        # LangSmith observability (v0.4+)
LOG_LEVEL=INFO            # DEBUG, INFO, WARNING, ERROR
RATE_LIMIT_PER_MINUTE=10  # Max run requests per IP per minute
```

Keys are read at server startup. The `/settings/providers` endpoint returns status only — never key values:

```python
@app.get("/settings/providers")
async def get_providers():
    return {
        "openai":    { "configured": bool(os.getenv("OPENAI_API_KEY")),
                       "models": ["gpt-4o", "gpt-4o-mini"] },
        "gemini":    { "configured": bool(os.getenv("GEMINI_API_KEY")),
                       "models": ["gemini-1.5-pro", "gemini-1.5-flash"] },
        "anthropic": { "configured": bool(os.getenv("ANTHROPIC_API_KEY")),
                       "models": ["claude-sonnet-4-5", "claude-haiku-4-5"] },
    }
    # Keys are never included in the response — only presence
```

### CLAUDE.md

Critical for AI-assisted development on this project. Defines the context any AI assistant needs to be immediately useful:

```markdown
# Graphweave — AI Assistant Context

## What this project is
Visual LangGraph agent builder. Canvas (React 19) → GraphSchema (JSON) → 
FastAPI execution (Python) → LangGraph StateGraph.

## The one rule
What you draw is what runs. GraphSchema maps 1:1 to LangGraph primitives.
No abstraction layer between the visual and the execution.

## Layer rules (enforced via TypeScript path aliases — tsc fails on violations)
- components/ → reads store only. Zero fetch() calls.
- store/       → calls service layer. Manages async state.
- api/         → service layer + base client. Pure async functions.
- sdk-core/    → zero imports from @graphweave/* packages.

## The contract
GraphSchema in packages/shared/src/schema.ts is the source of truth.
Canvas produces it. Execution consumes it. Both must agree.

## SSE event types
See packages/shared/src/events.ts

## Schema migrations
See packages/execution/app/db/migrations/
Applied automatically on server startup if stored version is behind.
```

---

## 7. Operational Design

This section captures design decisions that don't fit cleanly into architecture or features but are high-risk if left unaddressed.

### API Key Security

LLM provider keys are configured via `.env` only. They never touch the browser — not localStorage, not sessionStorage, not memory. The Settings page reads provider status from a `GET /settings/providers` endpoint that returns which keys are configured and which models are available, but never returns the key values themselves.

```
Settings page — what the browser sees:
┌────────────────────────────────────────┐
│  LLM Providers                         │
│                                        │
│  ✓ OpenAI      gpt-4o-mini  [Change ▼] │
│  ✗ Gemini      not configured          │
│  ✗ Anthropic   not configured          │
│                                        │
│  To add a provider, set the key in     │
│  your .env file and restart the server.│
│  See .env.example for details.         │
│                                        │
│  [Test connection]                     │
└────────────────────────────────────────┘
```

The target user — a LangGraph-aware developer — has set environment variables before. The `.env` workflow is not friction; it's the same setup they do for every LangGraph project. Optimizing for browser-based key entry would serve a user who isn't in the target segment, at the cost of exposing keys to browser storage vectors (extensions, XSS, filesystem).

The startup validation that already fails fast if a key is missing (`RuntimeError: OPENAI_API_KEY not set. See .env.example.`) is the entire onboarding flow for key configuration. No browser UI needed.

**Consequence for sdk-core Storage plugin**: The storage plugin is still used — for UI preferences (dark mode, panel layout, last-opened graph ID, canvas zoom level). It never handles credentials.

### Schema Migration System

The `version` field in GraphSchema is not decorative. Users will have graphs saved in SQLite from prior versions. Breaking schema changes — renaming a field, changing a type, restructuring a node config — must be handled without losing user data.

```
packages/execution/app/db/migrations/
├── 001_initial.py          # baseline schema
├── 002_add_run_history.py  # adds run_history table
└── 003_rename_tool_kind.py # renames config.kind → config.tool_type
```

On server startup, the migration runner compares the stored schema version against the latest migration number and applies any pending migrations in order. This runs before the server accepts requests.

```python
# db/migrate.py
def run_migrations(db: Connection):
    current = get_schema_version(db)
    pending = [m for m in load_migrations() if m.version > current]
    for migration in sorted(pending, key=lambda m: m.version):
        migration.up(db)
        set_schema_version(db, migration.version)
        logger.info(f"Applied migration {migration.version}: {migration.name}")
```

**Risk**: A migration has a bug and corrupts the SQLite database.
**Mitigation**: Each migration runs inside a transaction. On failure, the transaction rolls back and the server refuses to start with a clear error: "Migration 003 failed — database unchanged. Please file an issue at github.com/prosdevlab/graphweave."

**Risk**: User manually edits the SQLite file and breaks migration tracking.
**Mitigation**: Document that manual SQLite edits are unsupported. The migration version is stored in a `schema_version` table that migration tooling owns exclusively.

### SSE Reconnection Contract

The SSE connection is the heartbeat of the run experience. Network hiccups, container restarts, and browser tab switches can all drop it. The reconnection contract must be defined before the SSE hook is written — retrofitting it is painful.

```
Frontend SSE lifecycle:

CONNECTED → receives events → COMPLETED (normal)
         ↘ connection drops unexpectedly
           → RECONNECTING (exponential backoff: 1s, 2s, 4s)
           → On reconnect: GET /graphs/run/:id/status
             → { status: "completed", finalState }  → replay terminal event → COMPLETED
             → { status: "running" }                → reattach SSE stream → CONNECTED
             → { status: "paused", nodeId, prompt } → show resume UI → PAUSED
             → 404 / server error                   → FAILED, show "Server unavailable"
           → After 3 failed reconnects: FAILED
```

The `/graphs/run/:id/status` endpoint is the recovery key. It exists specifically to answer the question "what happened while I was disconnected?" and is available from v0.1.

### Human-in-the-Loop Resume Race Condition

The naive resume flow has a race condition: the user submits their input via POST /resume, the server feeds it to LangGraph and continues execution — but if the SSE connection dropped during the pause, no one is listening for the resumed events.

The correct sequence:

```
1. graph_paused event received → frontend shows input UI
2. User submits input
3. POST /graphs/run/:id/resume { input: "..." }
   → Server marks run as "resume_pending", does NOT continue execution yet
   → Returns { success: true, run_id }
4. Frontend immediately opens new SSE connection to /stream
5. Server detects new SSE connection for this run_id
6. Server feeds input to LangGraph checkpoint system
7. Execution continues, events stream to the new connection
```

Step 3 is the key change from the naive implementation. The server must not continue execution until it has confirmed an SSE listener is ready. A 2-second timeout: if no SSE connection arrives after the resume POST, execution continues anyway (the events are still stored in run history).

### LLM Router Cost Transparency

The `llm_router` condition type makes an LLM API call on every evaluation. In a looping research agent, this compounds. Users will be surprised by their API bills.

Two mitigations baked into the design:

**1. Inline cost warning in the condition node config panel:**
> "⚠ llm_router makes an LLM API call on every evaluation. In a loop with 5 iterations, this is 5 extra calls. Consider `field_equals` for cheaper routing where possible."

**2. `routing_model` field in v1.1:**
```typescript
interface LLMRouterCondition {
  type: "llm_router"
  prompt: string
  options: string[]
  routing_model?: string   // e.g. "gemini-flash" — cheaper than the main LLM node
}
```
This is a real production pattern: use a small, cheap model for classification/routing decisions and a large model for generation. Surfacing it explicitly makes Graphweave feel production-aware.

### Export Quality Strategy

Python export is a trust-building feature. If the generated code fails at runtime, users blame Graphweave. Two layers of protection:

**Layer 1: Compile-only validation (v1)**
Build the StateGraph and call `.compile()` without invoking it. Catches structural errors: missing nodes, invalid edge references, malformed condition branches. Returns a specific error with a node reference if validation fails.

**Layer 2: Dry-run validation (v1.1)**
Optional: run the graph with a synthetic minimal input. Catches runtime errors: missing state keys, tool input/output mismatches, LLM router returning values not in the branch map. Shown as a checkbox in the export modal: "Run validation test before export (recommended, ~$0.001)."

**Generated code quality:**
Every point requiring user action is annotated inline:
```python
# TODO: Set OPENAI_API_KEY environment variable before running
# export OPENAI_API_KEY=your-key-here
llm = ChatOpenAI(
    model="gpt-4o-mini",
    api_key=os.environ["OPENAI_API_KEY"]  # raises KeyError if not set
)
```

### Default State Model Explainer

The `messages` state field is always present and uses LangGraph's `add_messages` reducer. This has specific behavior (deduplication by message ID, support for different message types) that surprises users who expect it to behave like a plain list.

When a user first opens the state panel, a tooltip explains it in one sentence:

> **messages** uses LangGraph's `add_messages` reducer — it accumulates conversation history automatically and handles message deduplication. Add custom fields for data that isn't part of the conversation.

This is one sentence in a tooltip. It prevents a whole category of confused GitHub issues.

### sdk-core Extraction Protocol

The plan is to keep sdk-core as `@graphweave/sdk-core` inside the monorepo until v2, then extract to `prosdevlab/sdk-core` on npm. The extraction timeline moved from v1.0 to v2 based on the principle that "used internally for 6 months" doesn't mean "the public API is right."

Before extraction, a mandatory public API review:
1. Write a fresh README from scratch, pretending you're a new user
2. Write a fresh quickstart without looking at existing code
3. Every place you write "you have to know that..." is an API that needs to change
4. Fix those APIs first, then extract

This process takes a weekend. Skipping it means months of breaking changes post-extraction.

**Enforcement rule**: sdk-core has zero imports from other `@graphweave/*` packages at all times. Enforced via TypeScript path aliases — no `@graphweave/*` paths are defined in sdk-core's tsconfig, so any such import fails at typecheck time. `tsc --noEmit` runs in CI.

### Testing Strategy

No test strategy means expensive API calls in CI or no tests at all. Neither is acceptable.

**Mock LLM provider for unit testing:**
```python
class MockLLM:
    """Deterministic LLM for testing. Returns scripted responses."""
    def __init__(self, responses: dict[str, str]):
        self.responses = responses  # node_id → response content

    def invoke(self, messages):
        node_id = messages[-1].get("node_id")
        return AIMessage(content=self.responses.get(node_id, "mock response"))
```

Every execution layer test uses `MockLLM`. No real API calls in CI. A separate `tests/integration/` folder with real API calls, run manually or on a schedule — not in every PR.

**Frontend testing:**
Zustand store slices are pure functions — testable without React. The SSE hook is tested with a mock EventSource. Component tests use React Testing Library against the store (not the API). `@graphweave/shared` schema types are validated with Zod in tests.

---

## 8. GraphSchema Specification

The GraphSchema is the contract between the canvas and the execution engine. It is the most important design artifact in the project. Both layers must agree on it — changes are breaking changes and require a numbered migration.

### Top-Level Schema

```typescript
interface GraphSchema {
  id: string                    // uuid
  name: string
  description?: string
  version: number               // schema version — migrations applied on mismatch
  state: StateField[]           // LangGraph state channels
  nodes: NodeSchema[]
  edges: EdgeSchema[]
  metadata: {
    created_at: string          // ISO 8601
    updated_at: string
    author?: string
  }
}
```

### State Fields

```typescript
interface StateField {
  key: string
  type: "string" | "list" | "object" | "number" | "boolean"
  reducer: "replace" | "append" | "merge"
  // replace = last write wins (default)
  // append  = operator.add (for message lists)
  // merge   = dict merge (for object accumulation)
  default?: unknown
  readonly?: boolean            // true for the default messages field
}

// Default state (always present, cannot be removed in v1):
// { key: "messages", type: "list", reducer: "append", readonly: true }
```

### Node Hierarchy

Every node in Graphweave maps directly to a LangGraph primitive. There are no invented concepts — only LangGraph's actual building blocks made visual:

```
Tool node      → single bounded capability  (web_search, calculator, file_write)
LLM node       → reasoning step             (calls a model, reads + writes state)
Condition node → routing logic              (branches based on state or LLM decision)
HumanInput node→ interrupt + resume         (checkpoints, waits for human input)
Subgraph node  → reusable composed agent    (v2 — a compiled graph as a callable node)
Start / End    → graph entry + exit points
```

The Subgraph node is the skill composition primitive. A research agent graph built in Graphweave can be dropped as a single node into a larger orchestration graph — giving it a name, a clear input/output contract, and making it reusable. This is LangGraph's native subgraph concept; Graphweave makes it visual.

**Tools are the agent's bounded capabilities.** Each Tool node is a named, scoped skill with explicit inputs and outputs. The built-in tool registry is the standard library. `code_interpreter` (v1.1) is the escape hatch for when no standard tool covers the use case — arbitrary Python in a restricted sandbox, rather than a proliferation of single-purpose tool nodes.

### Built-in Tool Registry

Eight tools ship with v1, split across four categories. Every v1 tool works with zero configuration and zero required API keys.

| Category | Tool | Library | Key | Notes |
|---|---|---|---|---|
| **Retrieval** | `web_search` | Tavily / DDG | Optional | Auto-detects based on `TAVILY_API_KEY`; DDG fallback always works |
| **Retrieval** | `url_fetch` | httpx + trafilatura | No | Clean text extraction, 4000 char default cap |
| **Retrieval** | `wikipedia` | wikipedia-api | No | Summary by default, `full_article` opt-in |
| **Retrieval** | `file_read` | stdlib | No | Sandboxed to `/workspace` — reads files written in the same run |
| **Computation** | `calculator` | simpleeval | No | Safe math expression eval — legible node, no LLM token waste |
| **Computation** | `datetime` | stdlib | No | `now`, `today`, `days_until`, `days_since` — four operations |
| **Persistence** | `file_write` | stdlib | No | Sandboxed to `/workspace` — survives across nodes within a run |
| **Retrieval** | `weather` | Open-Meteo | No | Zero config, no key — high demo value for first-session agents |

All tools return a consistent response envelope:

```python
# Success
{ "success": True, "result": "...", "source": "tavily", "truncated": False }

# Error
{ "success": False, "error": "Rate limit exceeded", "recoverable": True }
```

The `recoverable` flag drives the frontend's inline retry / skip / cancel UI on a failed Tool node. Every tool must set it correctly — a recoverable error (rate limit, timeout) gets Retry; an unrecoverable error (bad config, missing file) gets Skip or Cancel only.

**What about grep, sed, awk, jq?** These are `code_interpreter` use cases, not dedicated tool nodes. An LLM handles simple text extraction natively; for deterministic transformation at scale (regex over a large file, jq over a deep JSON structure, CSV parsing), `code_interpreter` is the right tool — one Python snippet, no new node type. Adding dedicated nodes for Unix text utilities would clutter the canvas without adding expressiveness.

### Node Schemas

```typescript
type NodeSchema =
  | StartNode | LLMNode | ToolNode | ConditionNode | HumanInputNode | EndNode

interface BaseNode {
  id: string
  type: NodeSchema["type"]
  label: string
  position: { x: number; y: number }
  notes?: string
}

interface LLMNode extends BaseNode {
  type: "llm"
  config: {
    provider: "gemini" | "openai" | "anthropic"
    model: string
    system_prompt: string
    temperature: number
    max_tokens: number
    input_map: Record<string, string>
    output_key: string
  }
}

interface ConditionNode extends BaseNode {
  type: "condition"
  config: {
    condition: ConditionConfig
    branches: Record<string, string>   // branch label → target node id
    default_branch: string
  }
}

// v1 constrained condition types — no arbitrary code
type ConditionConfig =
  | { type: "field_equals";    field: string; value: string; branch: string }
  | { type: "field_contains";  field: string; value: string; branch: string }
  | { type: "field_exists";    field: string; branch: string }
  | { type: "llm_router";      prompt: string; options: string[];
      routing_model?: string }  // v1.1: cheaper model for routing
  | { type: "tool_error";      on_error: string; on_success: string }
  | { type: "iteration_limit"; field: string; max: number;
      exceeded: string; continue: string }

interface HumanInputNode extends BaseNode {
  type: "human_input"
  config: {
    prompt: string
    input_key: string
    timeout_ms?: number
  }
}
```

### SSE Event Types

```typescript
type GraphEvent =
  | { event: "run_started";     data: { run_id: string; timestamp: string } }
  | { event: "node_started";    data: { node_id: string; timestamp: string } }
  | { event: "node_completed";  data: { node_id: string; output: unknown;
                                         state_snapshot: unknown; duration_ms: number } }
  | { event: "edge_traversed";  data: { from: string; to: string;
                                         condition_result?: string } }
  | { event: "graph_paused";    data: { node_id: string; prompt: string;
                                         run_id: string } }
  | { event: "graph_completed"; data: { final_state: unknown; duration_ms: number } }
  | { event: "error";           data: { node_id?: string; message: string;
                                         recoverable: boolean } }
```

---

## 9. Frontend Tech Stack

```
React 19              — use(), Actions, useOptimistic, useFormStatus
TypeScript 5 (strict) — no any, strict null checks
Vite                  — dev server + build
@xyflow/react v12     — React Flow (React 19 compatible, confirmed)
Zustand               — state management (SSE lifecycle + React Flow require stable store refs)
Tailwind CSS          — utility-first styling, dark mode default
shadcn/ui             — component library (copy-owned, not dependency-owned)
CodeMirror 6          — JSON schema panel + condition expression editor
```

### Layer Rules (enforced via TypeScript path aliases — tsc --noEmit fails on violations)

```
components/     ← reads from store only. zero fetch(). zero API calls.
store/          ← calls service layer. manages async state including SSE lifecycle.
api/            ← service layer + base client. pure async functions. testable without React.
sdk-core/       ← zero imports from @graphweave/* packages. ever.
```

### Zustand Store Shape

```typescript
interface RunSlice {
  activeRunId: string | null
  runStatus: "idle" | "running" | "paused" | "reconnecting" | "completed" | "error" | "connection_lost"
  activeNodeId: string | null
  stateHistory: unknown[]
  runOutput: GraphEvent[]
  reconnectAttempts: number        // tracks exponential backoff state
  startRun: (input: unknown) => Promise<void>
  resumeRun: (input: string) => Promise<void>   // opens new SSE before server continues
  cancelRun: () => void
  handleConnectionLost: () => void  // triggers reconnection flow
}

interface UISlice {
  // UI preferences only — no credentials
  darkMode: boolean
  panelLayout: "right" | "bottom"
  lastOpenedGraphId: string | null
  // Persisted via sdk-core Storage plugin → localStorage
  // Keys never stored here — .env only
}
```

---

## 10. User Flows

### Flow 1: Build and Run a Simple Agent from Scratch

**User**: A developer who has read the LangGraph docs and wants to build their first agent visually.

**Preconditions**: `.env` configured with at least one provider key. Docker Compose running (`pnpm dev`). No graphs saved yet.

```
FIRST-TIME SETUP (done once, outside the browser):
  $ cp .env.example .env
  $ echo "OPENAI_API_KEY=sk-..." >> .env
  $ pnpm dev          # starts Vite + Docker dev container
  $ open localhost:3000

1. OPEN CANVAS
   Canvas opens. Header shows green provider indicator
   (read from GET /settings/providers — key is configured).
   Node palette on left. Empty canvas with "Drag nodes to start."

   ┌─────────────────────────────────────────────────────┐
   │  [⚙ Providers: ✓ OpenAI]      [▶ Run] [Export]    │
   │ ┌──────────┐ ┌───────────────────────────────────┐  │
   │ │ NODES    │ │                                   │  │
   │ │ ─────    │ │       Drag nodes to start         │  │
   │ │ Start    │ │                                   │  │
   │ │ LLM      │ │                                   │  │
   │ │ Tool     │ │                                   │  │
   │ │ Condition│ │                                   │  │
   │ │ Human    │ │                                   │  │
   │ │ End      │ │                                   │  │
   │ └──────────┘ └───────────────────────────────────┘  │
   └─────────────────────────────────────────────────────┘

   If no provider is configured, the indicator is amber and
   a non-blocking banner reads: "No LLM provider configured.
   Add a key to your .env file — see .env.example."
   The canvas is still fully usable for building; only Run
   is blocked until a key is present server-side.

2. OPEN SETTINGS (optional — provider status dashboard)
   Click the provider indicator → Settings panel slides in.
   Read-only status view. No key input fields.

   ┌────────────────────────────────────────┐
   │  LLM Providers                         │
   │                                        │
   │  ✓ OpenAI      gpt-4o-mini  [Change ▼] │
   │  ✗ Gemini      not configured          │
   │  ✗ Anthropic   not configured          │
   │                                        │
   │  To add a provider, set the key in     │
   │  your .env and restart the server.     │
   │  See .env.example for details.         │
   │                                        │
   │  [Test connection ▶]                   │
   └────────────────────────────────────────┘

3. BUILD THE GRAPH
   Drag Start → LLM → End onto canvas. Connect edges.

   ┌─────────────────────────────────────────────┐
   │                                             │
   │   [START] ──────► [LLM Node] ──────► [END] │
   │                                             │
   └─────────────────────────────────────────────┘

4. CONFIGURE LLM NODE
   Click LLM node → right sidebar opens.
   Set system prompt, provider, model, temperature.

   State panel shown below node config:
   ┌────────────────────────────────────┐
   │  Graph State                       │
   │  ─────────────────────────────     │
   │  messages  list  [append]          │
   │  ⓘ Uses LangGraph's add_messages   │
   │    reducer — accumulates history   │
   │    automatically. Add custom       │
   │    fields for non-conversation     │
   │    data.              [+ field]    │
   └────────────────────────────────────┘

5. VALIDATE
   User clicks Run ▶. Client-side validation runs:
   ✓ All nodes connected
   ✓ Start node present, End node present
   ✓ LLM node has system prompt
   ✓ Provider configured (checked via GET /settings/providers)
   Failures: red highlight on problem node + specific toast.
   Server-side validation on POST /graphs/run confirms.

6. RUN AND WATCH (SSE active)
   ┌────────────────────────────────────┐
   │  Run #1  ● RUNNING         [■ Stop]│
   │  ────────────────────────────────  │
   │  ✓ start     <1ms                  │
   │  ● llm_1     2.4s...               │
   │                                    │
   │  State:                            │
   │  messages: [                       │
   │    { role: "user",                 │
   │      content: "What are..." }      │
   │  ]                                 │
   └────────────────────────────────────┘

   Active node pulses. Edge animates as control flows.
   State panel updates after each node_completed event.
   Graph auto-saved to SQLite on first run.
```

**Risk**: Server env var not set — Run button blocked with no clear explanation.
**Mitigation**: Header shows amber provider indicator. Banner links directly to `.env.example` in the repo. Startup validation logs a clear error: "OPENAI_API_KEY not set. See .env.example."

---

### Flow 2: Load and Run an Example / Template Agent

**User**: Someone new to Graphweave who wants to see a working agent before building their own.

```
1. OPEN EXAMPLES
   Header: [Examples] [New Graph] [My Graphs]
   Examples gallery shows cards with node count, tools, Preview/Load.

2. PREVIEW (Research Agent)
                    ┌──────────┐
                    │  START   │
                    └────┬─────┘
                    ┌────▼─────┐
                    │web_search│
                    └────┬─────┘
                    ┌────▼─────┐
                    │url_fetch │
                    └────┬─────┘
                    ┌────▼─────┐
                    │   LLM    │
                    │(synthesize)
                    └────┬─────┘
             ┌───────────▼───────────┐
             │ CONDITION: llm_router │
             │ "enough info?"        │
             └──┬─────────────────┬──┘
              yes                  no
         ┌────▼────┐        ┌──────▼──────┐
         │   END   │        │ web_search  │ (loop)
         └─────────┘        └─────────────┘

   Cost warning shown: "llm_router fires on every loop
   iteration. Estimated: ~$0.005 per full run."

3. LOAD, INSPECT, RUN
   Graph copied as "Research Agent (copy)". Fully editable.
   User runs it, watches the loop execute across 2 passes.
   Condition panel shows which branch was taken each pass.

4. READ THE EXPORT
   User clicks Export → Python.
   Generated Python opens in preview panel.
   This is the learning moment — the visual graph maps
   directly to readable LangGraph code.
```

**Risk**: User runs template without understanding LLM loop costs.
**Mitigation**: Cost estimate shown in preview. First-load toast: "This is a copy — safe to edit and run. Estimated: <$0.01 per run."

---

### Flow 3: Human-in-the-Loop Pause and Resume

**User**: Developer building an agent requiring human approval before taking an action.

```
GRAPH TOPOLOGY:
  [START]──►[LLM: Draft]──►[HUMAN: Approve?]
                                    │
                          ┌─────────▼──────────┐
                          │ CONDITION           │
                          │ approval == "yes"   │
                          └──┬─────────────┬───┘
                           yes             no
                       ┌────▼────┐   ┌─────▼────┐
                       │ Tool:   │   │   END    │
                       │ post    │   │(cancelled)│
                       └────┬────┘   └──────────┘
                       ┌────▼────┐
                       │   END   │
                       └─────────┘

EXECUTION:
1. Run starts. LLM Draft node executes (2–3s).
   Draft written to state.

2. graph_paused event fires.
   Human Input node pulses amber.
   Inline input appears on the node showing the current draft:

   ┌──────────────────────────────┐
   │  HUMAN INPUT  ⏸             │
   │                              │
   │  Draft:                      │
   │  "The article argues that..."│
   │                              │
   │  [___________________________]│
   │  Type yes or no              │
   │  [Submit]                    │
   └──────────────────────────────┘

3. RESUME SEQUENCE (race condition handled):
   a. User types "yes", clicks Submit
   b. POST /resume → server marks run as resume_pending
      Does NOT continue execution yet
   c. Frontend immediately opens new SSE connection
   d. Server detects SSE listener ready
   e. Input fed to LangGraph checkpoint
   f. Execution continues, events stream to new connection

4. Graph completes. Run trace shows pause duration:
   ✓ start        <1ms
   ✓ llm_draft    2.3s
   ⏸ human_input  [paused 47s — user approved]
   ✓ condition    <1ms
   ✓ post         0.8s
   ✓ end          <1ms
```

**Risk**: User closes browser tab during pause.
**Mitigation**: State checkpointed to SQLite. On reload: "You have a paused run. Resume it?"

**Risk**: Resume POST succeeds but SSE connection never arrives (network issue).
**Mitigation**: 2-second timeout after resume_pending — server continues execution anyway. Events stored in run history regardless of whether frontend is listening.

---

### Flow 4: Debugging a Failed or Stuck Run

**User**: Developer whose agent errored mid-run.

```
1. ERROR EVENT FIRES
   SSE emits: error { nodeId: "web_search_1",
                       message: "Tavily rate limit exceeded",
                       recoverable: true }

   Canvas:
   ┌──────────────────────────────┐
   │  web_search  ✗ ERROR        │
   │                              │
   │  Tavily rate limit exceeded  │
   │  (recoverable)               │
   │                              │
   │  [Retry] [Skip] [Cancel]     │
   └──────────────────────────────┘

2. DEBUG PANEL (click the failed node)
   Shows: input at failure, full error + status code,
   state snapshot at failure, actionable suggestion,
   links to relevant external dashboards.

3. RUN HISTORY TAB
   ✗ Run #3   today 2:14pm   1.2s  (failed)
   ✓ Run #2   today 1:58pm   4.7s
   ✓ Run #1   today 1:45pm   3.2s

   Load Run #2 trace → canvas replay mode.
   Each node shows its prior output as a tooltip.
   User compares successful vs failed state at divergence.

4. FIX AND RETRY
   Switch tool config from Tavily to DuckDuckGo.
   Click Retry. LangGraph resumes from last checkpoint.
   Run panel: "Resuming from checkpoint after 'start' node."

5. JSON PANEL (power user path)
   Raw GraphSchema visible and editable.
   Invalid JSON highlighted with field-specific error.
   Apply Changes validates schema before updating canvas.
```

**Risk**: Retry re-runs from start, wasting LLM calls.
**Mitigation**: LangGraph checkpoints after each node. Retry explicitly shows checkpoint resume point.

**Risk**: Structured logs not available when debugging production issues.
**Mitigation**: JSON logging enabled from v0.1. Every event logged with run_id + node_id. `docker logs graphweave-execution | jq 'select(.run_id=="abc123")'` gives the full trace.

---

### Flow 5: Export and Deploy an Agent

**User**: Developer who has built and tested an agent and wants to run it in production.

```
1. EXPORT MODAL
   ┌────────────────────────────────────────────────┐
   │  Export "Research Agent"                       │
   │  ─────────────────────────────────────         │
   │  ● Python Script           (v1 — available)    │
   │    Runnable .py + requirements.txt             │
   │    [ ] Run validation test before export       │
   │        Catches runtime errors. ~$0.001.        │
   │                                                │
   │  ○ Docker Package          (v1.1 — coming)     │
   │  ○ GCP Cloud Run           (v2 — coming)       │
   │                     [Export Python →]          │
   └────────────────────────────────────────────────┘

2. EXPORT VALIDATION (two layers)
   Layer 1 (always): compile-only check
   → Build StateGraph, call .compile(), do not invoke
   → Returns specific error with node reference on failure

   Layer 2 (optional checkbox): dry-run validation (v1.1)
   → Run with synthetic minimal input
   → Catches: missing state keys, tool mismatches,
     llm_router returning unknown branch values

3. GENERATED FILES
   research_agent.py — fully runnable, annotated:

   # Generated by Graphweave v0.4
   # Graph: Research Agent
   #
   # TODO: Set environment variables before running:
   #   export OPENAI_API_KEY=your-key-here
   #   export TAVILY_API_KEY=your-key-here  # for web_search
   #
   # Run: python research_agent.py "your question here"

   requirements.txt — pinned versions matching execution container

4. RUN INDEPENDENTLY
   $ pip install -r requirements.txt
   $ export OPENAI_API_KEY=sk-...
   $ python research_agent.py "What is LangGraph?"

   No Graphweave server needed. No proprietary runtime.
   This is also the learning artifact — read the generated
   code to see what LangGraph code your graph corresponds to.
```

**Risk**: Generated code silently wrong at runtime due to key/model mismatch.
**Mitigation**: Compile validation (v1) + dry-run (v1.1). TODO comments on every user action point. KeyError raised immediately if env var missing — not silently ignored.

**Risk**: v1.1 Docker export creates expectations before it ships.
**Mitigation**: Badges are versioned ("v1.1"), not vague ("coming soon"). Clicking shows realistic timeline from the public roadmap.

---

## 11. Phased Roadmap

### v0.1 — Core Loop (private)

The smallest thing that proves the architecture works. Proves the hardest thing — SSE round-trip — before building anything else.

- Start, LLM, End nodes only
- Basic edge connection
- Settings: Gemini provider
- SSE stream with node highlight
- Docker Compose (both profiles)
- SQLite persistence + **migration system from day one**
- **Structured JSON logging**
- **CORS, .env.example, startup validation**
- **`/settings/providers` status endpoint (read-only, no key values)**
- **SSE reconnection contract + /status endpoint**
- CLAUDE.md

**Success criteria**: Draw → Run → watch execute in real time. SSE reconnection survives a container restart mid-run.

**Risk**: SSE + React 19 + React Flow integration harder than expected.
**Mitigation**: Spike the SSE → canvas highlight connection before any other feature. If it works, everything is additive.

---

### v0.2 — Full Node Set + Conditions

- Tool node (web_search, calculator, datetime, file_read, file_write, weather)
- Condition node (field_equals, field_contains, llm_router with cost warning)
- Human Input node + pause/resume (with race condition handling)
- Edge reconnection
- Client-side + server-side validation
- Run input modal
- State panel with messages tooltip

---

### v0.3 — Error Handling + History

- Error events: inline retry/skip/cancel
- Run history (last 10 runs per graph)
- Debug panel per node
- JSON schema panel (read-only)
- Graph naming and rename
- Rate limiting on /graphs/run
- Per-IP rate limit

---

### v0.4 — Polish + Public Launch

- Python export (compile-only validation)
- JSON panel read/write
- Minimap, keyboard shortcuts
- Dark mode (default)
- Anthropic Claude provider
- LangSmith integration (optional, documented)
- Example agents: research agent, code reviewer
- README, CONTRIBUTING.md, ARCHITECTURE.md
- Nextra docs site

**This is the version worth announcing publicly.** v0.3 is not — human-in-the-loop and error handling need to be solid and tested before announcing.

---

### v1.0 — Stable Release

- HTTP/API tool builder
- CLI tool type (command allowlist, sandboxed)
- Export dry-run validation
- `routing_model` on llm_router
- Advanced state definition
- Embedded condition editor (Monaco)
- Memory node (SQLite checkpointer)
- Docker export

---

### v2.0 — Deployment + Scale

- One-click GCP Cloud Run deploy (with API key auth header)
- sdk-core public API review + extraction to `@prosdev/sdk-core` on npm
- Subgraph tools
- Code tool (Monaco, full Python)
- Multi-user support
- Full run replay
- Plugin system for custom node types

---

## 12. Open Questions

**Q1: Multi-node selection in v0.2 or v0.3?**
React Flow provides multi-selection natively via `multiSelectionKeyCode`. Cost is one line. Current lean: v0.2 since React Flow gives it for free.

**Q2: JSON panel two-way — v0.3 or v0.4?**
Two-way requires robust parse/error handling — invalid JSON mid-edit must not crash the canvas. Current lean: read-only in v0.3, read/write in v0.4 once schema is proven stable through v0.2 and v0.3.

**Q3: LangSmith as optional vs. default in v0.4?**
Optional means some users never enable it and miss valuable observability. Default means a signup requirement on first run. Current lean: optional with a prominent in-app nudge: "Enable LangSmith for free run observability →"

**Q4: Rate limit strategy — per-IP or per-graph?**
Per-IP is simpler. Per-graph would prevent a single misconfigured looping agent from hammering the API while allowing other graphs to run freely. Current lean: per-IP in v0.3 (simple, ships fast), per-graph in v1.0 (more precise).

**Q5: Migration tooling — custom or Alembic?**
Alembic is the standard SQLAlchemy migration tool. It's mature and well-documented. Custom migrations are simpler to understand. Given the limited schema surface in v1, custom migrations are probably fine — but Alembic is the right call if the schema grows significantly in v2 (multi-user, sharing). Current lean: custom for v1, evaluate Alembic at v2.

---

*Last updated: March 2026*  
*Author: Pros Seng — prosdevlab*  
*License: MIT*
