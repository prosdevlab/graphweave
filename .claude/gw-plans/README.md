# Execution Layer — Plans

Plans for the GraphWeave execution layer (FastAPI + LangGraph backend).

Each plan is written before implementation, reviewed, and committed.
Implementation deviations are logged at the bottom of each plan file.

## Plans

| Phase | Plan | Status | PR |
|-------|------|--------|----|
| 1 | [DB, Tools, State Utils](phase-1-db-tools-state-utils.md) | ✅ Merged | [#1](https://github.com/prosdevlab/graphweave/pull/1) |
| 1.5 | [Scoped API Key Auth](phase-1.5-execution-auth.md) | 🔧 In progress | — |
| 2 | GraphSchema → LangGraph builder | 📋 Not started | — |
| 3 | Executor + SSE streaming | 📋 Not started | — |
| 4 | API routes (run, stream, resume, validate, export) | 📋 Not started | — |
| 5 | Exporter + remaining tools + SSRF transport | 📋 Not started | — |
| 6 | Deployment — Cloud Run + Turso + Vercel + CI/CD | 📋 Not started | — |

## Status Legend

- ✅ Merged — implemented, tested, merged to main
- 🔧 In progress — implementation underway
- 📋 Not started — plan not yet written
