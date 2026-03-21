# Canvas Phase 4 -- State Panel + LLM Wiring

**Status: Complete**

## Goal

Give users full control over graph state and LLM node wiring. After this phase:

1. LLM nodes write to `llm_response` (not `messages`), fixing the reducer workaround
2. LLM nodes have the same input_map/output_key config as Tool nodes
3. A left-sidebar State Panel shows all state fields with add/remove/type/reducer editing
4. Model dropdowns show real models fetched from providers

## Architecture

```
 CanvasRoute
 +-------------------------------------------------------------+
 | CanvasHeader (h-12)                                         |
 +-------------------------------------------------------------+
 | main (relative h-[calc(100vh-3rem)])                        |
 |                                                             |
 |  +--StatePanel--+  +---GraphCanvas---+  +--NodeConfig--+   |
 |  | (Sheet left) |  |                 |  | (Sheet right)|   |
 |  | side="left"  |  |   ReactFlow     |  | side="right" |   |
 |  |              |  |                 |  |              |   |
 |  | [messages]   |  |  FloatingTbar   |  | LLM Config   |   |
 |  | [user_input] |  |                 |  |  input_map   |   |
 |  | [llm_resp.]  |  |                 |  |  output_key  |   |
 |  | + Add field  |  |                 |  |              |   |
 |  +--------------+  +-----------------+  +--------------+   |
 |                                                             |
 |  +---RunPanel (Sheet bottom)---+                           |
 |  | ...                         |                           |
 |  +-----------------------------+                           |
 +-------------------------------------------------------------+

 State Panel and NodeConfig are both visible simultaneously.
 They use the existing Sheet component (side="left" / side="right").
```

### Data flow: LLM output_key clean break

```
BEFORE (Phase 3):
  LLM node: output_key = "messages"
  _make_llm_node() returns { "messages": response.content }
  LangGraph add_messages reducer appends it
  classifyFields: "messages" has append reducer -> stays in inputFields (workaround)

AFTER (Phase 4):
  LLM node: output_key = "llm_response"
  _make_llm_node() returns {
      "llm_response": response.content,
      "messages": [AIMessage(content=response.content)]   <-- NEW
  }
  LangGraph add_messages reducer appends the AIMessage to history
  classifyFields: output_key "llm_response" is replace -> excluded
                  "messages" never in outputKeys -> always in inputFields
                  Reducer check KEPT for merge/append fields (legitimate feature)
  DEFAULT_STATE includes: llm_response (type: "string", reducer: "replace")
```

### Data flow: LLM input_map config

```
User selects LLM node -> NodeConfigPanel -> LLMNodeConfig
                                              |
                                              +-- Provider/Model (existing)
                                              +-- System Prompt  (existing)
                                              +-- Temperature    (existing)
                                              |
                                              +-- Input Mappings (NEW)
                                              |     collapsed: param <- source
                                              |     expanded:  card editor
                                              |     presets from getRelevantFields()
                                              |
                                              +-- Output Key (NEW, hidden if terminal)
                                              |     default: "llm_response"

LLM auto-map differs from Tool:
  - No parameter registry (LLM has no typed params)
  - LLM has implicit inputs: "messages" (conversation) or explicit input_map
  - If input_map empty: uses messages from state (conversational pattern)
  - If input_map present: formats inputs as HumanMessage content
  - Users add rows manually (no schema-driven auto-fill)
```

### Data flow: Model fetching

```
GET /v1/settings/providers
  |
  v
Execution layer: for each configured provider, call provider API
  |
  openai:    client.models.list() -> filter chat models
  gemini:    genai.list_models()  -> filter generateContent
  anthropic: hardcoded list (no list API)
  |
  v
Response: { openai: { configured: true, models: ["gpt-4o", ...] }, ... }
  |
  v
settingsSlice.loadProviders() -> stores in state
  |
  v
LLMNodeConfig reads settingsSlice.providers -> populates model dropdown
  Falls back to hardcoded MODEL_OPTIONS if fetch fails or empty
```

## Scope decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| LLM output_key default | `"llm_response"` everywhere | Solo dev, can wipe graphs. Eliminates reducer workaround |
| State panel location | Left sidebar Sheet | Simultaneous view with right-side NodeConfig |
| State panel discoverability | 3 entry points: toolbar, "Manage fields →" link in configs, "+ New field..." in dropdown | Single toolbar icon is too hidden; link from node config creates a direct path |
| Terminology | "This node reads from" not "Input Mappings"; "When updated" not "Reducer" | User-facing language, not execution-layer jargon |
| Config panel sections | Collapsible "Model Settings" group in LLM config | Reduces scrolling; defaults collapsed after initial provider/model setup |
| Delete safety | Undo toast (5s) after field deletion + amber badge on affected nodes | Faster and more forgiving than confirmation-only; surfaces breakage immediately |
| Cross-panel linking | Clickable node names in state panel usage lines | Direct path from state field to node config without manual searching |
| Model fetching | Include in this phase | Low effort, high value. Endpoint exists, just returns empty |
| LLM auto-map | Manual rows only | LLM has no parameter registry. User adds rows as needed |
| Field reordering in state panel | Not in scope | Nice-to-have, adds drag complexity. Defer to Phase 5+ |

## Parts

| Part | Summary | Dependencies | Est. files |
|------|---------|-------------|------------|
| 4.1 | [LLM output_key clean break](phase-4.1-llm-output-key.md) | None | 5 |
| 4.2 | [LLM input_map + output_key config](phase-4.2-llm-config-wiring.md) | 4.1 | 3 |
| 4.3 | [State panel](phase-4.3-state-panel.md) | 4.1 | 5 |
| 4.4 | [Model fetching](phase-4.4-model-fetching.md) | None (parallel with 4.2/4.3) | 4 |

Parts 4.2 and 4.3 depend on 4.1. Part 4.4 is independent.
After 4.1, parts 4.2/4.3/4.4 can proceed in parallel.

## Out of scope

- Field reordering in state panel (drag-and-drop)
- Custom edge components (React Flow edge rendering)
- Debug panel (Phase 5)
- LLM router condition wizard improvements
- Python export
- System prompt template variables (e.g. `{{field_name}}` interpolation)
- State field validation rules (min/max for numbers, regex for strings)
- Undo/redo for state field changes

## Architecture constraints

- Components read store only -- no fetch(), no API imports (enforced by tsconfig)
- @api layer handles all HTTP calls
- Settings data cached in settingsSlice (fetch-once pattern)
- Schema changes are breaking changes -- but `llm_response` default is NOT a schema
  change (it's a config default change). The schema interface stays the same.
- Execution layer changes must not break existing Tool node behavior
- State panel must work with zero state fields (empty graph)
- Sheet component already supports side="left" -- no UI library changes needed

## Decisions & risks

| Decision | Risk | Mitigation |
|----------|------|------------|
| Change LLM default to `llm_response` | Existing saved graphs have `output_key: "messages"` | Solo dev, wipe graphs. No migration needed. |
| Execution appends AIMessage to messages | Double-write if user manually sets output_key to "messages" | Execution only appends to messages when output_key != "messages". If user sets "messages", old behavior preserved. |
| Left sidebar Sheet | May overlap with floating toolbar on small screens | Toolbar is positioned at left-4 (16px). Sheet is w-80 (320px). When sheet is open, toolbar stays underneath -- acceptable since user is focused on state panel. |
| Real model fetching | Provider APIs may be slow/fail | Use fallback hardcoded list. Fetch is async, non-blocking. Show "Loading..." during fetch. |
| State panel field deletion warning | User might ignore warning and break nodes | Warning is informational. Node configs with dangling references show validation errors on Run. |
