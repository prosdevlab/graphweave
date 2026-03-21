# Phase 4 Implementation Log

## PR #14 — feat(canvas): Phase 4 — state panel, input maps, model fetching, Radix Select

Merged: 2026-03-20

### What shipped

**4.1 — LLM output_key clean break**
- LLM nodes default to `output_key: "llm_response"` instead of `"messages"`
- Execution layer appends AIMessage to messages history alongside writing to output_key
- `DEFAULT_STATE` includes `llm_response` field
- `isAutoOutputKey` + `deduplicateOutputKey` utilities for smart output_key naming

**4.2 — LLM input_map + output_key config**
- Full input_map editor in LLMNodeConfig (collapsed summary + expanded card editor)
- Suggestion chips for upstream tool output fields
- output_key field (hidden when terminal node)
- `getRelevantFields` + `isTerminalNode` graph traversal utilities
- `autoMapParams` with user_input assignment, enum-like detection, quoted literals
- Type-filtered presets with `buildPresetsForParam`
- Source node name hints via `resolveSourceHint` / `resolveSourceLabel`

**4.3 — State panel**
- Left sidebar Sheet with add/edit/remove state fields
- AddFieldForm with type and reducer selection
- StateFieldRow with inline editing, usage tracking, delete with undo toast
- 3 entry points: toolbar icon, config panel link, dropdown "+ New field..."

**4.4 — Model fetching**
- `GET /v1/settings/providers` endpoint returns real model lists
- `settingsSlice.loadProviders()` with fallback to hardcoded defaults
- Collapsible "Model Settings" section in LLMNodeConfig

**Bonus: Radix Select migration**
- Replaced all native `<select>` with Radix-based Select component
- `description` prop for secondary text in select items

### Bug fixes (post-merge, same PR)

**fix(canvas): cascade output_key renames to downstream node mappings**
- `rewriteStateExpression()` utility for rewriting root keys in state expressions
- `renameOutputKey()` store action: atomically updates source node, downstream input_maps, condition fields, and state entries
- Blur-based cascade in ToolNodeConfig and LLMNodeConfig for manual edits
- Tool-switch cascade in ToolNodeConfig

**fix(canvas): create unique input fields when user_input already claimed**
- `getClaimedInputKeys()` helper scans other nodes' input_maps for claimed root keys
- `autoMapParams` extended with optional `claimedInputKeys` param
- When `user_input` is claimed, creates `{param_name}_input` with dedup

### Key decisions during implementation

| Decision | Rationale |
|----------|-----------|
| Cascade on blur, not keystroke | Avoids rewriting downstream on every character typed in output_key |
| `renameOutputKey` as atomic store action | Single state update for source node + all downstream + state field rename |
| `claimedInputKeys` as optional param | Backward compatible — existing callers unaffected |
| Radix Select in same PR | Needed for description prop; touching all selects anyway |

### Test coverage

- 464 tests passing after all changes
- New test suites: `rewriteStateExpression`, `renameOutputKey`, `getClaimedInputKeys`, `autoMapParams` with claimed keys
- Existing suites extended: `graphTraversal.test.ts`, `graphSlice.test.ts`, `presetUtils.test.ts`
