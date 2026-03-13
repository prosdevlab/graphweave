---
name: gw-schema
description: "GraphSchema spec, BaseNode, EdgeSchema, all node types (start, end, LLM, tool, condition, human_input), input_map/output_key state wiring, state fields, SSE event types, tool response envelope, migration system, and built-in tool registry. Load when touching GraphSchema types, adding node types, changing SSE events, writing migrations, or working across the canvas/execution boundary."
disable-model-invocation: true
---

# Skill: Schema

Load this when: touching GraphSchema types, adding node types, changing
SSE events, writing migrations, or working across the canvas/execution boundary.

---

## GraphSchema — top-level

```typescript
interface GraphSchema {
  id: string                 // uuid
  name: string
  description?: string
  version: number            // drives migration system — increment on breaking changes
  state: StateField[]        // LangGraph state channels
  nodes: NodeSchema[]
  edges: EdgeSchema[]
  metadata: {
    created_at: string       // ISO 8601
    updated_at: string
    author?: string
  }
}
```

## State fields

```typescript
interface StateField {
  key: string
  type: "string" | "list" | "object" | "number" | "boolean"
  reducer: "replace" | "append" | "merge"
  default?: unknown
  readonly?: boolean         // true for the default messages field
}

// Default state — always present, cannot be removed in v1:
// { key: "messages", type: "list", reducer: "append", readonly: true }
// Uses LangGraph's add_messages reducer — accumulates history + deduplicates.
```

## Edge schema

```typescript
interface EdgeSchema {
  id: string
  source: string             // source node id
  target: string             // target node id
  label?: string             // displayed on canvas; required for condition branches
  condition_branch?: string  // which branch this edge represents (condition nodes only)
}
```

## Node types

```typescript
type NodeSchema =
  | StartNode | LLMNode | ToolNode | ConditionNode | HumanInputNode | EndNode

// Node hierarchy — each maps to a LangGraph primitive:
// Tool node       → single bounded capability  (web_search, calculator, file_write)
// LLM node        → reasoning step             (calls a model, reads + writes state)
// Condition node  → routing logic              (branches on state or LLM decision)
// HumanInput node → interrupt + resume         (LangGraph interrupt pattern)
// Subgraph node   → reusable composed agent    (v2)
// Start / End     → graph entry + exit points

interface BaseNode {
  id: string
  type: NodeSchema["type"]
  label: string
  position: { x: number; y: number }
  notes?: string
}

interface StartNode extends BaseNode {
  type: "start"
  config: {}                 // no config — entry point only
}

interface EndNode extends BaseNode {
  type: "end"
  config: {}                 // no config — exit point only
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

interface ToolNode extends BaseNode {
  type: "tool"
  config: {
    tool_name: string        // must match a registered tool in the execution layer
    input_map: Record<string, string>
    output_key: string
  }
}

// input_map / output_key — how nodes read and write state:
//
//   input_map: { "query": "messages[-1].content" }
//   → reads state.messages[-1].content and passes it as the tool's "query" param
//
//   output_key: "search_results"
//   → writes the node's output into state.search_results
//
// This is the same pattern on LLMNode and ToolNode. The builder uses input_map
// to extract values from LangGraph state before calling the node, and output_key
// to write the result back into state after the node completes.

interface ConditionNode extends BaseNode {
  type: "condition"
  config: {
    condition: ConditionConfig
    branches: Record<string, string>   // branch label → target node id
    default_branch: string
  }
}

interface HumanInputNode extends BaseNode {
  type: "human_input"
  config: {
    prompt: string
    input_key: string
    timeout_ms?: number
  }
}
```

## Condition types (v1 — constrained, no arbitrary code)

```typescript
type ConditionConfig =
  | { type: "field_equals";    field: string; value: string; branch: string }
  | { type: "field_contains";  field: string; value: string; branch: string }
  | { type: "field_exists";    field: string; branch: string }
  | { type: "llm_router";      prompt: string; options: string[];
      routing_model?: string }   // v1.1: cheaper model for routing
  | { type: "tool_error";      on_error: string; on_success: string }
  | { type: "iteration_limit"; field: string; max: number;
      exceeded: string; continue: string }
```

## SSE event types

```typescript
type GraphEvent =
  | { event: "run_started";     data: { run_id: string; timestamp: string } }
  | { event: "node_started";    data: { node_id: string; timestamp: string } }
  | { event: "node_completed";  data: { node_id: string; output: unknown;
                                         state_snapshot: unknown; duration_ms: number } }
  | { event: "edge_traversed";  data: { from: string; to: string;
                                         condition_result?: string } }
  | { event: "graph_paused";    data: { node_id: string; prompt: string; run_id: string } }
  | { event: "graph_completed"; data: { final_state: unknown; duration_ms: number } }
  | { event: "error";           data: { node_id?: string; message: string;
                                         recoverable: boolean } }
```

## Tool response envelope (all tools must conform)

```python
# Success
{ "success": True, "result": "...", "source": "tavily", "truncated": False }

# Error — recoverable drives retry/skip/cancel UI
{ "success": False, "error": "Rate limit exceeded", "recoverable": True }

# recoverable: True  → show Retry button (rate limit, timeout, network)
# recoverable: False → show Skip / Cancel only (bad config, missing file)
```

## Built-in tool registry (v1 — 8 tools, 4 categories)

| Category    | Tool           | Library              | Key      |
|-------------|----------------|----------------------|----------|
| Retrieval   | web_search     | Tavily / DDG fallback| Optional |
| Retrieval   | url_fetch      | httpx + trafilatura  | No       |
| Retrieval   | wikipedia      | wikipedia-api        | No       |
| Retrieval   | file_read      | stdlib               | No       |
| Retrieval   | weather        | Open-Meteo           | No       |
| Computation | calculator     | simpleeval           | No       |
| Computation | datetime       | stdlib               | No       |
| Persistence | file_write     | stdlib               | No       |

`file_read` / `file_write` are sandboxed to `/workspace` within the run.
`web_search` auto-detects `TAVILY_API_KEY`; falls back to DuckDuckGo.

## Migration system

```
packages/execution/app/db/migrations/
├── 001_initial.py
├── 002_add_run_history.py
└── 003_rename_tool_kind.py
```

Rules:
- Every breaking GraphSchema change requires a new numbered migration file
- Migrations run on server startup, before accepting requests
- Each migration runs inside a transaction — failure rolls back, server refuses to start
- `schema_version` table is owned exclusively by migration tooling — never edit manually

```python
def run_migrations(db: Connection):
    current = get_schema_version(db)
    pending = [m for m in load_migrations() if m.version > current]
    for migration in sorted(pending, key=lambda m: m.version):
        migration.up(db)          # inside a transaction
        set_schema_version(db, migration.version)
```
