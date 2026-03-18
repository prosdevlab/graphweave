# Canvas Phase 3 — Full Node Set + Settings Page

**Status: Complete** (merged to main 2026-03-18)

## Goal

Add Tool, Condition, and HumanInput node components to the canvas so users can
build complete graphs visually. Add a settings page showing provider status.
After this phase, every node type in GraphSchema is drawable and configurable.

## What was delivered

Phase 3 expanded significantly beyond the original scope during implementation.
In addition to the 6 planned parts, the following were pulled forward from
Phase 4 and delivered:

### Pulled forward from Phase 4

| Feature | Files | Why |
|---------|-------|-----|
| **Run input dialog** — schema-driven form/JSON modal | `RunInputDialog.tsx`, `RunFormFields.tsx`, `runInputUtils.ts` | Tool nodes are unusable without a way to provide initial state |
| **Consumed-fields logic** — only show fields that nodes actually read | `runInputUtils.ts` (`getConsumedInputFields`) | Without this, dialog shows every state field including internal ones |
| **Field hints + presets** — tool-aware descriptions, type-filtered dropdowns | `runInputUtils.ts` (`buildFieldHints`), `presetUtils.ts` | Core UX for mapping params to state fields |
| **Graph traversal utilities** — upstream BFS, relevant fields, terminal detection | `graphTraversal.ts` | Context-aware dropdown filtering in ToolNodeConfig |
| **Two-tier ToolNodeConfig** — collapsed summary / expanded card views | `ToolNodeConfig.tsx` | Auto-mapped params need a compact view; editing needs detail |
| **Auto-map** — automatic param→state field matching with field creation | `presetUtils.ts` (`autoMapParams`) | Eliminates manual wiring for simple graphs |
| **Reducer-aware classification** — append/merge fields stay as user inputs | `runInputUtils.ts` (`classifyFields`) | LLM default `output_key: "messages"` was hiding the messages input |
| **Combobox UI** — cmdk-based searchable dropdown | `Combobox.tsx`, `Command.tsx`, `Popover.tsx` | Run dialog field selection |
| **Skip-dialog for zero-input graphs** — run immediately when no inputs needed | `CanvasHeader.tsx` (uncommitted) | UX: `Start → Tool → End` shouldn't prompt for input |
| **Pydantic model_dump in state_utils** — LangChain message object support | `state_utils.py` (uncommitted) | `messages[-1].content` expressions failed on Pydantic objects |

### Originally planned (all complete)

| Layer | Status |
|-------|--------|
| Schema types (ToolNode, ConditionNode, HumanInputNode) | Fully defined in `schema.ts` |
| Execution layer (builder, routers, tool registry) | Fully implemented |
| Tool registry (8 tools: calculator, datetime, url_fetch, etc.) | Production-ready |
| `GET /settings/providers` endpoint | Returns configured status per provider |
| BaseNodeShell, StartNode, LLMNode, EndNode components | Complete |
| Config panel pattern (NodeConfigPanel, LLMNodeConfig) | Complete |
| NODE_DEFAULTS, TOOLBAR_ITEMS, nodeTypes | All 6 types registered |
| Client-side validation (validateGraph) | All node types covered |

## Architecture

```
                     TOOLBAR (toolbarItems.ts)
                         |
          adds 3 new items: tool, condition, human_input
                         |
                         v
                  NODE DEFAULTS (nodeDefaults.ts)
                         |
          adds default configs for tool, condition, human_input
                         |
                         v
     +-------------------+-------------------+
     |                   |                   |
     v                   v                   v
  ToolNode.tsx    ConditionNode.tsx   HumanInputNode.tsx
  (wrench icon)  (git-branch icon)   (user icon)
     |                   |                   |
     v                   v                   v
  BaseNodeShell      BaseNodeShell       BaseNodeShell
  (tool_name badge)  (condition type     (prompt preview)
                      badge + branch
                      count)
     |                   |                   |
     v                   v                   v
  ToolNodeConfig   ConditionNodeConfig  HumanInputNodeConfig
  (tool select,    (condition type       (prompt, input_key,
   input_map,       form, branches,       timeout)
   output_key)      default_branch)
```

### Edge flow for Condition nodes

```
  Condition Node
       |
       |--- edge { condition_branch: "yes" } ---> Node A
       |--- edge { condition_branch: "no" }  ---> Node B
       |--- edge { condition_branch: "default" } ---> Node C

  Canvas stores condition_branch on EdgeSchema.
  Builder reads it via edge.get("condition_branch").
  React Flow shows it as an edge label.
```

### Settings page data flow

```
  /settings route (App.tsx)
       |
       v
  SettingsPage.tsx (component)
       |
       reads from settingsSlice (store)
       |
       v
  settingsSlice.ts (store)
       |
       calls settings.ts (api)
       |
       v
  GET /settings/providers  (execution)
  GET /settings/tools      (execution, new endpoint)
       |
       v
  { openai: { configured, models }, ... }
  [ { name, description }, ... ]
```

## Scope decisions

### 1. Input/output mapping UI for Tool nodes

**Include basic input_map + output_key fields in ToolNodeConfig.** The LLMNodeConfig
defers these to Phase 4's State panel, but Tool nodes are unusable without them
(tool_name alone is not enough -- the builder calls `resolve_input_map` on every
tool invocation). Simple key-value pair editor for input_map, text input for output_key.

### 2. Condition branch edge wiring

**Edge label via config panel.** When user connects an edge FROM a condition node,
auto-set `condition_branch` to a default like `branch_N`. Users edit the branch
name by clicking the condition node's config panel. `config.branches` is derived
from edges at save time -- not manually maintained.

### 3. Settings page scope

**Provider status display only.** Show configured/not-configured per provider.
Model fetching is Phase 4+ (endpoint currently returns empty models arrays).

## Parts

| Part | Summary | Status |
|------|---------|--------|
| 3.1 | [Node defaults + toolbar](phase-3.1-node-defaults-toolbar.md) -- Register 3 new node types | Complete |
| 3.2 | [ToolNode config](phase-3.2-tool-node-config.md) -- Tool select, input_map editor, output_key | Complete (expanded: two-tier UI, auto-map, presets, graph traversal) |
| 3.3 | [ConditionNode config + edge wiring](phase-3.3-condition-node-config.md) -- 6 condition types, branch edges | Complete |
| 3.4 | [HumanInputNode config](phase-3.4-human-input-node-config.md) -- Prompt, input_key, timeout | Complete |
| 3.5 | [Validation rules](phase-3.5-validation.md) -- Client-side rules for new nodes | Complete |
| 3.6 | [Settings page](phase-3.6-settings-page.md) -- Provider status + tool list | Complete |

## Remaining for Phase 4

Items originally scoped as Phase 4 that were NOT pulled forward:

- **State panel** -- full state field management UI (add/remove/reorder fields, configure reducers)
- **LLM input_map wiring** -- LLM nodes currently show "State wiring coming soon"; need input_map + output_key config like Tool nodes have
- **Model fetching** from providers -- settings/providers currently returns empty models[]
- **Custom edge components** -- edges use default React Flow rendering with labels
- **Debug panel** (Phase 5) -- per-node state inspection during runs
- **LLM router condition wizard** -- users fill in the form fields directly

### Known architectural debt (from Phase 3)

- **LLM default `output_key: "messages"`** — LLM nodes should write to a
  dedicated field (e.g. `llm_response`) and the execution layer should append
  to `messages`. Currently `classifyFields` works around this with reducer-aware
  filtering. See TODOs in `nodeDefaults.ts` and `runInputUtils.ts`.
- **Tool result not auto-wired to LLM** — In `Start → Tool → LLM → End`, the
  LLM's empty `input_map` means `tool_result` never reaches the LLM. Requires
  the State panel + LLM input_map config to fix properly.

## Architecture constraints

- Components read store only -- no `fetch()`, no API imports
- `@api` layer handles all HTTP calls
- Settings data cached in `settingsSlice` (fetch-once pattern)
- `condition_branch` stored on `EdgeSchema` -- builder already reads it
- `config.branches` derived from edges at save time, not manually maintained
- New nodes are additive -- no schema changes, no breaking changes
