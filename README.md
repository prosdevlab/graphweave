# Graphweave

**Visual LangGraph builder where your graph runs exactly as drawn** — visually compose nodes, edges, and tools, then stream execution in real time.

> [!NOTE]
> Graphweave is in early development. The canvas builder and execution backend are functional, but graph execution (run a graph and stream results) is not yet wired end-to-end.

## What is this?

Every team whiteboard-designs their agent flow, then spends days translating it into LangGraph code — wiring nodes, debugging edges, mapping state. The diagram and the code drift apart immediately.

Graphweave kills that gap. The canvas **is** the execution. No translation step, no drift. You draw the agent, you run the agent. Same artifact.

### The rule

**What you draw is what runs.** GraphSchema maps 1-to-1 to LangGraph primitives. No abstraction layer between the visual and the execution.

## Current status

| Layer | What works | What's next |
|-------|-----------|-------------|
| **Canvas** | Home view, Start/LLM/End nodes, edge wiring, config panel, save/load, floating toolbar | [SSE run panel, full node set →](.claude/gw-plans/canvas/) |
| **Execution** | API key auth, graph CRUD, tool registry (8 tools), migrations | [Graph run + SSE streaming →](.claude/gw-plans/execution/) |
| **Shared** | GraphSchema contract, node types, edge types | Condition + HumanInput wiring |

## Architecture

```
packages/
├── canvas/       React 19 + React Flow + Zustand — the visual builder
├── shared/       GraphSchema types — the contract between canvas and execution
├── sdk-core/     Plugin interfaces (transport, events, storage)
└── execution/    FastAPI + LangGraph — builds and runs graphs via SSE
```

The **canvas** produces a `GraphSchema`. The **execution** layer consumes it, builds a LangGraph `StateGraph`, and streams node-by-node execution back over SSE.

### Node types

| Node | Purpose |
|------|---------|
| **Start** | Entry point — every graph has exactly one |
| **LLM** | Calls a language model (Gemini, OpenAI, Anthropic) |
| **Tool** | Runs a registered tool with input/output mapping |
| **Condition** | Branches on field checks, LLM routing, tool errors, or iteration limits |
| **Human Input** | Pauses execution and waits for user input |
| **End** | Terminal node — every graph has at least one |

### Supported providers

- Google Gemini
- OpenAI
- Anthropic

## Getting started

### Prerequisites

- **Node.js** >= 20
- **pnpm** >= 10
- **Docker** (for the execution layer)
- **uv** (for Python dependency management)

### Setup

```bash
# Clone
git clone https://github.com/prosdevlab/graphweave.git
cd graphweave

# Install dependencies
pnpm install

# Copy environment config
cp .env.example packages/execution/.env
# Add at least one LLM provider key to packages/execution/.env

# Start everything (canvas + execution in Docker)
pnpm dev
```

This runs the React canvas on `http://localhost:5173` and the FastAPI execution server on `http://localhost:8000`.

### Verify

```bash
# TypeScript + Python checks in parallel
pnpm verify

# Or individually
pnpm typecheck        # TypeScript type checking
pnpm check            # Biome lint + format
pnpm verify:py        # Ruff + pytest
```

## Project structure

| Path | What | Managed by |
|------|------|------------|
| `packages/canvas/` | React 19 + Vite + Tailwind v4 | pnpm |
| `packages/shared/` | GraphSchema TypeScript types | pnpm + tsup |
| `packages/sdk-core/` | Plugin interfaces | pnpm + tsup |
| `packages/execution/` | FastAPI + LangGraph | uv + Docker |
| `docker-compose.yml` | Production execution | Docker |
| `docker-compose.dev.yml` | Dev execution (hot reload) | Docker |

## Contributing

### Commit conventions

This repo uses [Conventional Commits](https://www.conventionalcommits.org/) enforced by commitlint.

```
type(scope): description

# Examples
feat(canvas): add node drag-and-drop
fix(execution): handle missing API key gracefully
chore(deps): bump langchain to 0.3
```

**Types:** `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `ci`, `build`, `revert`

**Scopes:** `canvas`, `shared`, `sdk-core`, `execution`, `docs`, `deps`, `docker`, `schema`, `skills`

### Pre-commit hooks

Commits automatically run:
1. `.env` file guard — blocks accidental secret commits
2. **lint-staged** — Biome for TS/JS, Ruff for Python
3. **typecheck** — full `tsc --noEmit` (cached by Turbo)
4. **commitlint** — validates commit message format

## License

MIT
