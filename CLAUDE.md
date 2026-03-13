# Graphweave — AI Assistant Context

## The one rule

**What you draw is what runs.**

GraphSchema maps 1:1 to LangGraph primitives. No abstraction layer between
the visual and the execution. No invented concepts — only LangGraph's actual
building blocks made visual.

---

## Package managers

- **pnpm** for all JavaScript/TypeScript. Never npm or yarn.
- **uv** for all Python. Never pip directly.
- **Docker** for the execution layer. `docker-compose.dev.yml` only during
  development. Never run FastAPI outside Docker.

---

## Layer rules (enforced via TypeScript path aliases — `tsc` fails on violations)

```
packages/canvas/src/components/  → reads store only. zero fetch(). zero API calls.
packages/canvas/src/store/       → calls service layer. owns SSE lifecycle.
packages/canvas/src/api/         → service layer + base client. pure async.
packages/sdk-core/               → zero imports from @graphweave/*. ever.
```

Components import from `@store` and `@ui` path aliases only — not from `@api`.
`tsc --noEmit` enforces this in CI. Violations are architecture errors, not style.

Biome handles formatting and linting. No ESLint.

---

## The contract

`packages/shared/src/schema.ts` is the source of truth.

- Canvas **produces** GraphSchema
- Execution **consumes** GraphSchema
- Both must agree — schema changes are breaking changes
- Every breaking change requires a numbered migration file

---

## Non-negotiables

- API keys live in `.env` only. Never in browser storage. Never in code.
- `uv.lock` is committed. Docker uses `uv sync --frozen`.
- SSE reconnection is always handled. No fire-and-forget SSE connections.
- Every tool response includes `{ success, recoverable }`. No silent failures.
- Migrations run on server startup inside transactions. Server refuses to
  start if a migration fails.

---

## Skills (load when relevant)

```
.claude/skills/gw-architecture/  — monorepo structure, Docker setup, layer rules detail
.claude/skills/gw-schema/        — GraphSchema spec, node types, SSE events, migrations
.claude/skills/gw-frontend/      — React 19 patterns, Zustand slices, React Flow, SSE hook
.claude/skills/gw-execution/     — FastAPI structure, LangGraph builder, tool registry
.claude/skills/gw-testing/       — MockLLM, test structure, what runs in CI vs manually
```
