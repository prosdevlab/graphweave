# Phase 3.1 — Node Defaults + Toolbar

## Goal

Register tool, condition, and human_input in NODE_DEFAULTS, TOOLBAR_ITEMS,
nodeTypes, and CSS. Placeholder node components render with correct icons and
colors so users can immediately drag all node types onto the canvas.

## Files to modify

| File | Action |
|------|--------|
| `packages/canvas/src/utils/nodeDefaults.ts` | Add 3 defaults |
| `packages/canvas/src/constants/toolbarItems.ts` | Add 3 toolbar items |
| `packages/canvas/src/index.css` | Add 3 accent classes |
| `packages/canvas/src/components/canvas/nodes/ToolNode.tsx` | New |
| `packages/canvas/src/components/canvas/nodes/ConditionNode.tsx` | New |
| `packages/canvas/src/components/canvas/nodes/HumanInputNode.tsx` | New |
| `packages/canvas/src/components/canvas/nodes/nodeTypes.ts` | Register 3 types |

## Design

### Toolbar layout after this part

```
  +-------+  +-------+  +-------+  +-----------+  +-------------+  +-------+
  | Start |  |  LLM  |  | Tool  |  | Condition |  | Human Input |  |  End  |
  +-------+  +-------+  +-------+  +-----------+  +-------------+  +-------+
   emerald    indigo      amber      violet         cyan             red
```

### Node defaults

```typescript
tool: () => ({
  type: "tool",
  label: "Tool",
  config: {
    tool_name: "calculator",
    input_map: {},
    output_key: "tool_result",
  },
}),
condition: () => ({
  type: "condition",
  label: "Condition",
  config: {
    condition: { type: "field_equals", field: "", value: "", branch: "yes" },
    branches: {},
    default_branch: "",
  },
}),
human_input: () => ({
  type: "human_input",
  label: "Human Input",
  config: {
    prompt: "Please provide input:",
    input_key: "user_input",
    timeout_ms: 300000,
  },
}),
```

### Toolbar items (lucide-react icons)

| Type | Icon | Accent | Description |
|------|------|--------|-------------|
| tool | `Wrench` | amber | "Run a tool with inputs" |
| condition | `GitBranch` | violet | "Branch based on state" |
| human_input | `UserCircle` | cyan | "Pause for user input" |

### CSS accent classes

```css
.gw-node-tool { @apply border-amber-500; }
.gw-node-condition { @apply border-violet-500; }
.gw-node-human_input { @apply border-cyan-500; }
```

### Node component pattern

Each is a thin wrapper around BaseNodeShell (same as StartNode/EndNode).
They'll be enhanced with config badges in parts 3.2-3.4.

```
  Placeholder (this part):

  ●──┤ [Wrench]  Tool       ├──●      amber border
  ●──┤ [Branch]  Condition   ├──●      violet border
  ●──┤ [User]    Human Input ├──●      cyan border

  After enhancement (parts 3.2-3.4):

  ●──┤ [Wrench]  Tool       ├──●
     │ CALCULATOR            │         tool_name badge
     └──────────────────────-┘

  ●──┤ [Branch]  Condition   ├──●
     │ FIELD_EQUALS 2 branch │         condition type + branch count
     └──────────────────────-┘

  ●──┤ [User]    Human Input ├──●
     │ Please provide inp... │         truncated prompt preview
     └──────────────────────-┘
```

### Canvas with all 6 node types

```
  ┌──────────────────────────────────────────────────────────┐
  │                                                          │
  │   ┌──────────┐                                           │
  │   │ ▷ Start  │──────────┐                                │
  │   └──────────┘          │                                │
  │                         v                                │
  │                  ┌─────────────┐                          │
  │                  │ 🧠 LLM      │                          │
  │                  │ GEMINI      │──────┐                   │
  │                  └─────────────┘      │                   │
  │                         │             v                   │
  │                         v      ┌─────────────┐           │
  │                  ┌────────────┐│ 🔧 Tool      │           │
  │                  │ ⑂ Cond.    ││ WEB_SEARCH   │           │
  │                  │ FIELD_EQ   │└──────┬───────┘           │
  │                  └──┬────┬───┘       │                   │
  │             yes ────┘    └──── no    │                   │
  │                  v             v     │                   │
  │           ┌──────────┐  ┌──────────┐ │                   │
  │           │ 👤 Human  │  │ □ End    │ │                   │
  │           │ Input     │  └──────────┘ │                   │
  │           └─────┬─────┘              │                   │
  │                 └────────────────────┘                   │
  │                                                          │
  └──────────────────────────────────────────────────────────┘
```

## Verification

- `tsc --noEmit` passes
- All 6 node types appear in the floating toolbar
- Dragging each new type onto canvas renders correctly with proper icon/color
- Drop-on-edge insertion works for new types (uses existing findNearestEdge)
