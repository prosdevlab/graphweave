# Phase 3.2 — ToolNode Config

## Goal

Add ToolNodeConfig panel with tool select dropdown, input_map key-value editor,
and output_key input. Add `GET /settings/tools` endpoint to serve the tool
registry to the frontend. Create settings API client and settingsSlice.

## Files to modify

| File | Action |
|------|--------|
| `packages/execution/app/main.py` | Add `GET /settings/tools` endpoint |
| `packages/canvas/src/api/settings.ts` | New -- `getTools()`, `getProviders()` |
| `packages/canvas/src/store/settingsSlice.ts` | New -- tools/providers cache |
| `packages/canvas/src/components/panels/config/ToolNodeConfig.tsx` | New |
| `packages/canvas/src/components/panels/NodeConfigPanel.tsx` | Add tool case |
| `packages/canvas/src/components/canvas/nodes/ToolNode.tsx` | Enhance with tool_name badge |

## Design

### Data flow

```
  ToolNodeConfig
       |
       reads tools from settingsSlice
       |
       v
  settingsSlice.loadTools()
       |
       calls settings.ts API client
       |
       v
  GET /settings/tools  (new endpoint)
       |
       returns from REGISTRY
       |
       v
  [ { name: "calculator", description: "Evaluate math" },
    { name: "web_search", description: "Search the web" },
    ... ]
```

### GET /settings/tools endpoint

No auth required — same pattern as `/settings/providers` and `/health`.
Tool list contains no secrets (names + descriptions only).

```python
@app.get("/settings/tools", tags=["System"])
async def get_tools() -> list[dict]:
    from app.tools.registry import REGISTRY
    return [
        {"name": tool.name, "description": tool.description}
        for tool in REGISTRY.values()
    ]
```

**Test required** (`test_settings.py`): verify `GET /settings/tools` returns
a list of `{name, description}` dicts matching REGISTRY entries.

### ToolNodeConfig layout

```
  +------------------------------------------+
  | Label                                    |
  | [___________________________________]    |
  |                                          |
  | Tool                                     |
  | [calculator                         v]   |
  |                                          |
  | Input Mapping                            |
  |  Param Name         State Key            |
  | [expression    ]   [user_query     ] [x] |
  | [_____________ ]   [______________ ] [x] |
  |                          [+ Add mapping] |
  |                                          |
  | Output Key                               |
  | [tool_result________________________]    |
  +------------------------------------------+
```

### Input map semantics

`input_map: Record<string, string>` maps **param name → state key**.
Example: `{ "expression": "user_query" }` means "take `state['user_query']`
and pass it as `expression` to the tool".

UI shows: param name on left, state key on right. Internal state is
`Array<{ param: string; stateKey: string }>`, serialized to Record on change.

### settingsSlice

```typescript
interface SettingsSlice {
  tools: ToolInfo[];
  toolsLoaded: boolean;
  loadTools: () => Promise<void>;
  providers: Record<string, ProviderStatus> | null;
  providersLoaded: boolean;
  loadProviders: () => Promise<void>;
}
```

Fetch-once pattern: `loadTools()` returns early if already loaded. Called from
ToolNodeConfig on mount and from SettingsPage (Part 3.6).

### ToolNode presenter enhancement

Show `tool_name` as a badge below the label (same pattern as LLMNode
showing provider + model):

```
  +---------------------------+
  |  [Wrench]  My Tool        |
  |  CALCULATOR               |
  +---------------------------+
```

## Verification

- `tsc --noEmit` passes
- `GET /settings/tools` returns tool list from execution server
- Clicking a Tool node opens config panel with tool dropdown populated
- Changing tool updates the node badge on canvas
- Input map editor: add/remove rows, values persist on save/reload
