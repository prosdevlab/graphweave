# Phase 3.4 — HumanInputNode Config

## Goal

Add HumanInputNodeConfig panel with prompt, input_key, and timeout fields.
Enhance the node presenter with a truncated prompt preview.

## Files to modify

| File | Action |
|------|--------|
| `packages/canvas/src/components/panels/config/HumanInputNodeConfig.tsx` | New |
| `packages/canvas/src/components/panels/NodeConfigPanel.tsx` | Add human_input case |
| `packages/canvas/src/components/canvas/nodes/HumanInputNode.tsx` | Enhance with prompt preview |

## Design

### HumanInputNodeConfig layout

```
  +------------------------------------------+
  | Label                                    |
  | [___________________________________]    |
  |                                          |
  | Prompt                                   |
  | [Please provide input:              ]    |
  | [                                   ]    |
  | [___________________________________]    |
  |                                          |
  | Input Key                                |
  | [user_input________________________]    |
  |                                          |
  | Timeout (ms)                             |
  | [300000____________________________]    |
  |                                          |
  | The graph will pause at this node and    |
  | wait for user input. The response is     |
  | stored in the state key specified above. |
  +------------------------------------------+
```

### HumanInputNode presenter

Show truncated prompt preview below the label:

```
  +-------------------------------+
  |  [UserCircle]  Human Input    |
  |  Please provide input:...     |
  +-------------------------------+
```

Prompt truncated to ~40 chars with CSS `truncate` + `max-w-[140px]`.

### Input sanitization

`timeout_ms` is optional in the schema (`timeout_ms?: number`). If the user
clears the field, `Number.parseInt("")` returns `NaN`. Sanitize on change:
if empty or NaN, fall back to `300000`. Same pattern as LLMNodeConfig where
temperature/max_tokens always have values.

## Verification

- `tsc --noEmit` passes
- Click Human Input node: config panel opens with prompt, input_key, timeout fields
- Edit prompt: preview updates on canvas node
- Clear timeout field: defaults back to 300000, no NaN in serialized JSON
- Save + reload: config persists correctly
