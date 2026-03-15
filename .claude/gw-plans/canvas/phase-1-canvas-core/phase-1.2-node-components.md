# C1.2: Node Components -- BaseNodeShell + Start/LLM/End Presenters

## Commit

```
feat(canvas): add BaseNodeShell and Start/LLM/End node components

- BaseNodeShell: shared chrome with configurable handles, label, selected state
- StartNode: green accent, source handle only
- LLMNode: blue accent, both handles, shows provider/model badge
- EndNode: red accent, target handle only
- nodeTypes registry for React Flow
- Node CSS styles and pulse animation for active state
- Tests for all node presenters
```

## Files Touched

| Action | File |
|--------|------|
| create | `packages/canvas/src/components/canvas/nodes/BaseNodeShell.tsx` |
| create | `packages/canvas/src/components/canvas/nodes/StartNode.tsx` |
| create | `packages/canvas/src/components/canvas/nodes/LLMNode.tsx` |
| create | `packages/canvas/src/components/canvas/nodes/EndNode.tsx` |
| create | `packages/canvas/src/components/canvas/nodes/nodeTypes.ts` |
| modify | `packages/canvas/src/index.css` |
| create | `packages/canvas/src/components/canvas/nodes/__tests__/StartNode.test.tsx` |
| create | `packages/canvas/src/components/canvas/nodes/__tests__/LLMNode.test.tsx` |
| create | `packages/canvas/src/components/canvas/nodes/__tests__/EndNode.test.tsx` |
| create | `packages/canvas/src/components/canvas/nodes/__tests__/BaseNodeShell.test.tsx` |
| delete | `packages/canvas/src/components/canvas/.gitkeep` |

---

## Detailed Todolist

### 1. Delete gitkeep

- [ ] Delete `packages/canvas/src/components/canvas/.gitkeep`

### 2. Add node styles to index.css

- [ ] Append to `packages/canvas/src/index.css`:
  ```css
  /* Node base styles */
  .gw-node {
    @apply rounded-lg border-2 bg-zinc-900 px-3 py-2 text-xs text-zinc-100 shadow-md;
    min-width: 140px;
  }

  .gw-node-selected {
    @apply ring-2 ring-blue-500 ring-offset-1 ring-offset-zinc-950;
  }

  /* Node type accent borders */
  .gw-node-start {
    @apply border-emerald-500;
  }
  .gw-node-llm {
    @apply border-blue-500;
  }
  .gw-node-end {
    @apply border-red-500;
  }

  /* Active node pulse (driven by runSlice.activeNodeId in C2) */
  .gw-node-active {
    animation: gw-pulse 1.5s ease-in-out infinite;
  }

  @keyframes gw-pulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.5); }
    50% { box-shadow: 0 0 0 8px rgba(59, 130, 246, 0); }
  }

  /* Handle styles */
  .react-flow__handle {
    @apply h-3 w-3 rounded-full border-2 border-zinc-700 bg-zinc-500;
  }
  .react-flow__handle-connecting {
    @apply bg-blue-500;
  }
  .react-flow__handle-valid {
    @apply bg-emerald-500;
  }
  ```

### 3. Create BaseNodeShell

- [ ] Create `packages/canvas/src/components/canvas/nodes/BaseNodeShell.tsx`:

  Props interface:
  ```typescript
  import { Handle, Position } from "@xyflow/react";
  import { memo, type ReactNode } from "react";
  import type { LucideIcon } from "lucide-react";

  interface BaseNodeShellProps {
    label: string;
    icon: LucideIcon;             // Lucide icon component (Play, Brain, Square)
    typeLabel: string;            // e.g. "START", "LLM", "END" -- shown as badge
    accentClass: string;          // e.g. "gw-node-start"
    selected: boolean;
    sourceHandle?: boolean;       // default true
    targetHandle?: boolean;       // default true
    children?: ReactNode;         // node-specific content area
  }
  ```

  Implementation:
  - Outer div: `gw-node ${accentClass} ${selected ? "gw-node-selected" : ""}`
  - Top row: icon (Lucide, size=12) + type badge (uppercase, muted) + label (truncated, font-medium)
  - Children slot below the label (for node-specific content like provider/model)
  - Conditional `<Handle type="target" position={Position.Left} />` if `targetHandle !== false`
  - Conditional `<Handle type="source" position={Position.Right} />` if `sourceHandle !== false`
  - Wrap with `memo` for performance

### 4. Create StartNode

- [ ] Create `packages/canvas/src/components/canvas/nodes/StartNode.tsx`:

  ```typescript
  import { memo } from "react";
  import type { NodeProps, Node } from "@xyflow/react";
  import type { StartNode as StartNodeSchema } from "@shared/schema";
  import { Play } from "lucide-react";
  import { BaseNodeShell } from "./BaseNodeShell";

  type StartNodeData = Node<StartNodeSchema>;

  function StartNodeComponent({ data, selected }: NodeProps<StartNodeData>) {
    return (
      <BaseNodeShell
        label={data.label}
        icon={Play}
        typeLabel="START"
        accentClass="gw-node-start"
        selected={!!selected}
        targetHandle={false}
      />
    );
  }

  export const StartNode = memo(StartNodeComponent);
  ```

  - `Play` icon — universal "begin" symbol
  - No target handle (entry point only)
  - No children (Start has no config to show on-node)
  - Green accent

### 5. Create LLMNode

- [ ] Create `packages/canvas/src/components/canvas/nodes/LLMNode.tsx`:

  ```typescript
  import { memo } from "react";
  import type { NodeProps, Node } from "@xyflow/react";
  import type { LLMNode as LLMNodeSchema } from "@shared/schema";
  import { Brain } from "lucide-react";
  import { BaseNodeShell } from "./BaseNodeShell";

  type LLMNodeData = Node<LLMNodeSchema>;

  function LLMNodeComponent({ data, selected }: NodeProps<LLMNodeData>) {
    return (
      <BaseNodeShell
        label={data.label}
        icon={Brain}
        typeLabel="LLM"
        accentClass="gw-node-llm"
        selected={!!selected}
      >
        <div className="mt-1 flex items-center gap-1.5 text-zinc-400">
          <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] uppercase">
            {data.config.provider}
          </span>
          <span className="truncate text-[10px]">{data.config.model}</span>
        </div>
      </BaseNodeShell>
    );
  }

  export const LLMNode = memo(LLMNodeComponent);
  ```

  - `Brain` icon — AI/intelligence, clearer than sparkles
  - Both handles
  - Shows provider badge + model name below label
  - Blue accent

### 6. Create EndNode

- [ ] Create `packages/canvas/src/components/canvas/nodes/EndNode.tsx`:

  ```typescript
  import { memo } from "react";
  import type { NodeProps, Node } from "@xyflow/react";
  import type { EndNode as EndNodeSchema } from "@shared/schema";
  import { Square } from "lucide-react";
  import { BaseNodeShell } from "./BaseNodeShell";

  type EndNodeData = Node<EndNodeSchema>;

  function EndNodeComponent({ data, selected }: NodeProps<EndNodeData>) {
    return (
      <BaseNodeShell
        label={data.label}
        icon={Square}
        typeLabel="END"
        accentClass="gw-node-end"
        selected={!!selected}
        sourceHandle={false}
      />
    );
  }

  export const EndNode = memo(EndNodeComponent);
  ```

  - `Square` icon — universal "stop" symbol
  - No source handle (exit point only)
  - No children
  - Red accent

### 7. Create nodeTypes registry

- [ ] Create `packages/canvas/src/components/canvas/nodes/nodeTypes.ts`:

  ```typescript
  import type { NodeTypes } from "@xyflow/react";
  import { StartNode } from "./StartNode";
  import { LLMNode } from "./LLMNode";
  import { EndNode } from "./EndNode";

  /** React Flow nodeTypes registry -- keys must match NodeSchema.type */
  export const nodeTypes: NodeTypes = {
    start: StartNode,
    llm: LLMNode,
    end: EndNode,
  } as const;
  ```

  This is defined outside the component tree (module-level constant) so React Flow
  does not re-register types on every render.

### 8. Write tests

All node tests mock `@xyflow/react` Handle component to avoid RF layout engine:

```typescript
vi.mock("@xyflow/react", () => ({
  Handle: ({ type, position }: { type: string; position: string }) => (
    <div data-testid={`handle-${type}`} data-position={position} />
  ),
  Position: { Left: "left", Right: "right" },
}));
```

- [ ] Create `packages/canvas/src/components/canvas/nodes/__tests__/BaseNodeShell.test.tsx`:
  - Test: renders label and type badge
  - Test: renders both handles by default
  - Test: omits target handle when `targetHandle={false}`
  - Test: omits source handle when `sourceHandle={false}`
  - Test: applies selected class when `selected={true}`
  - Test: renders children in content area

- [ ] Create `packages/canvas/src/components/canvas/nodes/__tests__/StartNode.test.tsx`:
  - Test: renders with "START" badge and label
  - Test: has source handle but no target handle
  - Test: applies start accent class
  - Props factory: `{ data: { id: "1", type: "start", label: "Start", position: { x: 0, y: 0 }, config: {} }, selected: false }`

- [ ] Create `packages/canvas/src/components/canvas/nodes/__tests__/LLMNode.test.tsx`:
  - Test: renders with "LLM" badge and label
  - Test: shows provider badge and model name
  - Test: has both handles
  - Test: applies llm accent class
  - Props factory: `{ data: { id: "2", type: "llm", label: "Chat", position: { x: 0, y: 0 }, config: { provider: "openai", model: "gpt-4o", system_prompt: "", temperature: 0.7, max_tokens: 1024, input_map: {}, output_key: "result" } }, selected: false }`

- [ ] Create `packages/canvas/src/components/canvas/nodes/__tests__/EndNode.test.tsx`:
  - Test: renders with "END" badge and label
  - Test: has target handle but no source handle
  - Test: applies end accent class

### 9. Verify

- [ ] Run `pnpm --filter @graphweave/canvas typecheck`
- [ ] Run `pnpm --filter @graphweave/canvas lint`
- [ ] Run `pnpm --filter @graphweave/canvas test`
- [ ] All three must pass before committing

---

## What Could Go Wrong

| Risk | Detection | Rollback |
|------|-----------|----------|
| React Flow `NodeProps` type mismatch with our generic `Node<NodeSchema>` | `tsc --noEmit` fails | Adjust type casting -- RF v12 uses generics but the exact signature may need `as` cast |
| CSS `@apply` not working in index.css with Tailwind 4 | Visual inspection in dev server | Tailwind 4 uses `@import "tailwindcss"` which should support `@apply`. If not, convert to inline Tailwind classes |
| Handle component mock doesn't match RF v12 API | Tests fail | Update mock to match actual Handle props |
