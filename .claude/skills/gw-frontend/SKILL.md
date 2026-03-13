---
name: gw-frontend
description: "React 19 patterns, Zustand store slices (graph/run/UI), React Flow v12 integration, SSE reconnection state machine, human-in-the-loop resume, client-side graph validation, debug panel, LLM router cost warning, shadcn/ui components, and Tailwind dark mode. Load when working on canvas, store slices, SSE connection, components, panels, validation, or run panel."
disable-model-invocation: true
---

# Skill: Frontend

Load this when: working on canvas, store slices, SSE connection, components,
settings panel, or run panel. Also load schema.md if touching node types.

---

## Tech stack

```
React 19              use(), Actions, useOptimistic, useFormStatus
TypeScript 5 strict   no any, strict null checks throughout
Vite                  dev server + build
@xyflow/react v12     React Flow — React 19 compatible
Zustand               state management — SSE lifecycle needs stable store refs
Tailwind CSS          utility-first, dark mode default
shadcn/ui             copy-owned components (not a dependency)
CodeMirror 6          JSON schema panel + condition expression editor
```

## Layer rules — hard boundaries

```
components/  → reads store only. zero fetch(). zero API calls. zero useEffect for data.
store/       → calls service layer. owns SSE lifecycle. manages all async state.
api/         → service layer + base client. pure async functions. no React.
sdk-core/    → zero imports from @graphweave/* packages. ever.
```

Enforced via TypeScript path aliases — `tsc --noEmit` fails on violations.
`components/` only has `@store` and `@ui` in its allowed paths. `@api` is
not reachable from components by design. See architecture.md for tsconfig detail.

Biome handles formatting and linting. No ESLint.

## Package structure

```
packages/canvas/src/
├── components/
│   ├── canvas/       # React Flow nodes, edges, canvas wrapper
│   ├── panels/       # Sidebar, run panel, settings, debug panel
│   └── ui/           # shadcn/ui base components
├── store/
│   ├── graphSlice.ts # graph CRUD, canvas state
│   ├── runSlice.ts   # SSE lifecycle, reconnection, run status
│   └── uiSlice.ts    # dark mode, panel layout, last-opened graph
│                     # persisted via sdk-core Storage → localStorage
│                     # never stores credentials
├── api/
│   ├── client.ts     # base fetch wrapper (sdk-core Transport)
│   ├── graphs.ts     # graph CRUD
│   └── runs.ts       # run + SSE stream + reconnection
└── types/            # re-exports from @graphweave/shared
```

## Zustand store shape

```typescript
// runSlice.ts — owns the entire SSE lifecycle
interface RunSlice {
  activeRunId: string | null
  runStatus: "idle" | "running" | "paused" | "reconnecting"
            | "completed" | "error" | "connection_lost"
  activeNodeId: string | null
  stateHistory: unknown[]
  runOutput: GraphEvent[]
  reconnectAttempts: number
  startRun: (input: unknown) => Promise<void>
  resumeRun: (input: string) => Promise<void>
  cancelRun: () => void
  handleConnectionLost: () => void
}

// uiSlice.ts — UI preferences only, no credentials
interface UISlice {
  darkMode: boolean
  panelLayout: "right" | "bottom"
  lastOpenedGraphId: string | null
}
```

## SSE reconnection state machine

```
CONNECTED → graph_completed → COMPLETED  (normal path)
          ↘ connection drops unexpectedly
            → RECONNECTING (backoff: 1s → 2s → 4s, max 3 attempts)
            → GET /graphs/run/:id/status
              { status: "completed" } → replay terminal event → COMPLETED
              { status: "running"   } → reattach to /stream   → CONNECTED
              { status: "paused"    } → show resume UI        → PAUSED
              404 / server error      → FAILED, show banner
            → 3 failed attempts → FAILED
```

Always implement this state machine. Never leave SSE connections without
reconnection handling.

## Human-in-the-loop resume (race condition fix)

```
WRONG — naive:                    CORRECT:
POST /resume                      POST /resume
→ server feeds input              → server marks 'resume_pending'
→ execution continues             → does NOT continue yet
→ events fire                     → returns { success: true }
→ nobody listening ✗              → frontend opens NEW SSE connection
                                  → server detects SSE listener
                                  → feeds input to LangGraph
                                  → execution continues ✓
```

`resumeRun()` in runSlice must open the new SSE connection before the
POST /resume call returns. The server has a 2-second timeout — if no SSE
arrives, execution continues anyway (events stored in run history).

## Settings panel — read-only, no key input

The settings panel shows provider status only. It never has key input fields.

```typescript
// GET /settings/providers — called on app load and after .env changes
type ProviderStatus = {
  configured: boolean
  models: string[]
}
// Returns { openai: ProviderStatus, gemini: ProviderStatus, anthropic: ProviderStatus }
// Never returns key values — only presence
```

If no provider is configured: amber indicator in header + non-blocking banner.
Canvas is still usable for building. Only Run is blocked.

## Graph validation (client-side, before run)

Validation runs when the user clicks Run. Failures red-highlight the problem
node and show a specific toast. All checks must pass before the request hits
the server.

```
Checks:
✓ Start node present
✓ End node present
✓ All nodes connected (no orphans)
✓ LLM nodes have a system prompt
✓ Tool nodes reference a registered tool_name
✓ Condition nodes have at least one branch edge
✓ Provider is configured (checked via GET /settings/providers cache)
```

Server-side validation on `POST /graphs/{id}/run` repeats these checks plus
structural compilation via `build_graph()`. Client-side validation is for
fast feedback — server-side is the authority.

## Debug panel

Click a node after a run to open the debug panel. Shows context at that
point in execution:

```
┌────────────────────────────────────┐
│  web_search  ✗ ERROR              │
│                                    │
│  Input:   { "query": "..." }      │
│  Error:   Tavily rate limit (429) │
│  State:   { messages: [...] }     │
│  Duration: 1.2s                   │
│                                    │
│  Suggestion: Switch to DuckDuckGo │
│  fallback (remove TAVILY_API_KEY) │
└────────────────────────────────────┘
```

Available for every node after run, not just failures. On success it shows
input, output, state snapshot, and duration.

## LLM router cost warning

The `llm_router` condition type makes an LLM API call on every evaluation.
In a looping agent this compounds. The condition config panel shows an
inline warning when `llm_router` is selected:

> "llm_router makes an LLM API call on every evaluation. In a loop with
> 5 iterations, this is 5 extra calls. Consider field_equals for cheaper
> routing where possible."

Templates that use `llm_router` in a loop show an estimated cost in the
preview card (e.g. "Estimated: ~$0.005 per full run").

## React Flow node pulse pattern

```typescript
// Active node gets a CSS class — React Flow handles the rest
const nodeClassName = (nodeId: string) =>
  activeNodeId === nodeId ? "node-active" : ""

// node-active in CSS:
// animation: pulse 1s ease-in-out infinite;
// border-color: var(--brand-accent);
```

Keep node visual state derived from the Zustand store.
Never store visual state inside React Flow node data.
