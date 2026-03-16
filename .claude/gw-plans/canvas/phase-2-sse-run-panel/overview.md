# Canvas Phase 2 — SSE Run Panel

## Goal

Wire the canvas to the execution backend so users can run a graph and watch
it execute in real time. Node-by-node SSE streaming, active node highlighting,
reconnection, and human-in-the-loop resume.

## What already exists

| Layer | Status |
|-------|--------|
| Execution API (`POST /v1/graphs/{id}/run`, `GET /v1/runs/{id}/stream`, resume, cancel, status) | Fully implemented |
| SSE event types (`@shared/events` — 7 event types) | Defined |
| `runs.ts` API stub | Skeleton — wrong URL path, no reconnection |
| `runSlice.ts` store stub | Skeleton — all action bodies are TODOs |
| `CanvasHeader` | No run button yet |
| `Sheet` UI component | Supports right/left — needs bottom |
| `UISlice.panelLayout` | Already tracks `"right" \| "bottom"` |
| Node pulse CSS | Documented in gw-frontend skill, not yet implemented |

## Parts

| Part | Summary | Depends on |
|------|---------|------------|
| 2.1 | [SSE service layer](phase-2.1-sse-service-layer.md) — EventSource wrapper with reconnection, correct API paths, typed event parsing | — |
| 2.2 | [RunSlice implementation](phase-2.2-run-slice.md) — Full state machine, event dispatch, start/cancel/resume actions | 2.1 |
| 2.3 | [Run button + validation](phase-2.3-run-button-validation.md) — CanvasHeader run button, client-side validation, run input dialog | 2.2 |
| 2.4 | [Run panel + node highlighting](phase-2.4-run-panel.md) — Bottom/right panel with event timeline, active node pulse on canvas | 2.2 |
| 2.5 | [Reconnection + resume UI](phase-2.5-reconnection-resume.md) — Full reconnection state machine with backoff, human-in-the-loop resume form | 2.1, 2.4 |

## Out of scope (Phase 3+)

- Tool/Condition/HumanInput node components (Phase 3)
- Debug panel with per-node state inspection (Phase 5)
- Run history list (Phase 5)
- Run input modal with schema-driven form fields (Phase 4)

## Architecture constraints

- Components read store only — no `fetch()`, no API imports
- `runSlice` calls `@api/runs` — owns SSE lifecycle
- `EventSource` is managed by the service layer, not the store
- Reconnection uses `Last-Event-ID` for server-side replay
- All API path params use `encodeURIComponent()`
- Toast for errors via `useUIStore.getState().showToast()`
