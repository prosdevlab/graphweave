# C1.4: Node Config Panel + Config Forms

## Commit

```
feat(canvas): add NodeConfigPanel with Start/LLM/End config forms

- NodeConfigPanel: container that reads CanvasContext, dispatches to config forms
- StartNodeConfig: label-only form
- LLMNodeConfig: provider, model, system prompt, temperature, max tokens
- EndNodeConfig: label-only form
- graphSlice.updateNodeConfig action
- Panel slides in from right when a node is selected
- Tests for config forms and updateNodeConfig
```

## Files Touched

| Action | File |
|--------|------|
| modify | `packages/canvas/src/store/graphSlice.ts` |
| create | `packages/canvas/src/components/panels/NodeConfigPanel.tsx` |
| create | `packages/canvas/src/components/panels/config/StartNodeConfig.tsx` |
| create | `packages/canvas/src/components/panels/config/LLMNodeConfig.tsx` |
| create | `packages/canvas/src/components/panels/config/EndNodeConfig.tsx` |
| modify | `packages/canvas/src/App.tsx` |
| create | `packages/canvas/src/components/panels/config/__tests__/LLMNodeConfig.test.tsx` |
| create | `packages/canvas/src/components/panels/config/__tests__/StartNodeConfig.test.tsx` |
| create | `packages/canvas/src/store/__tests__/graphSlice.updateNodeConfig.test.ts` |
| create | `packages/canvas/src/components/panels/__tests__/NodeConfigPanel.test.tsx` |
| delete | `packages/canvas/src/components/panels/.gitkeep` |

---

## Detailed Todolist

### 1. Add updateNodeConfig to graphSlice

- [ ] Add to `GraphSlice` interface:
  ```typescript
  updateNodeConfig: (id: string, updates: { label?: string; config?: Record<string, unknown> }) => void;
  ```

- [ ] Implementation:
  ```typescript
  updateNodeConfig: (id, updates) =>
    set((s) => ({
      dirty: true,
      nodes: s.nodes.map((n) =>
        n.id === id
          ? {
              ...n,
              ...(updates.label !== undefined ? { label: updates.label } : {}),
              ...(updates.config !== undefined
                ? { config: { ...n.config, ...updates.config } }
                : {}),
            }
          : n,
      ) as NodeSchema[],
    })),
  ```

  The `as NodeSchema[]` cast is needed because spreading config loses the
  discriminated union narrowing. This is safe because we only merge partial
  config updates -- we never change the node type.

### 2. Delete gitkeep

- [ ] Delete `packages/canvas/src/components/panels/.gitkeep`

### 3. Create config form components

All config forms are **dumb presenters**: they receive the node data + an onChange
callback as props. No internal state, no effects, no store access.

- [ ] Create `packages/canvas/src/components/panels/config/StartNodeConfig.tsx`:

  ```typescript
  import { memo, useCallback, type ChangeEvent } from "react";
  import type { StartNode } from "@shared/schema";
  import { Input } from "@ui/Input";

  interface StartNodeConfigProps {
    node: StartNode;
    onChange: (updates: { label?: string }) => void;
  }

  function StartNodeConfigComponent({ node, onChange }: StartNodeConfigProps) {
    const handleLabelChange = useCallback(
      (e: ChangeEvent<HTMLInputElement>) => {
        onChange({ label: e.target.value });
      },
      [onChange],
    );

    return (
      <div className="space-y-4">
        <div>
          <label htmlFor="node-label" className="mb-1 block text-xs font-medium text-zinc-400">
            Label
          </label>
          <Input
            id="node-label"
            value={node.label}
            onChange={handleLabelChange}
            placeholder="Start"
          />
        </div>
        <p className="text-xs text-zinc-500">
          Entry point of the graph. No additional configuration.
        </p>
      </div>
    );
  }

  export const StartNodeConfig = memo(StartNodeConfigComponent);
  ```

- [ ] Create `packages/canvas/src/components/panels/config/EndNodeConfig.tsx`:

  Same pattern as StartNodeConfig. Label field + description text:
  "Exit point of the graph. No additional configuration."

- [ ] Create `packages/canvas/src/components/panels/config/LLMNodeConfig.tsx`:

  ```typescript
  import { memo, useCallback, type ChangeEvent } from "react";
  import type { LLMNode } from "@shared/schema";
  import { Input } from "@ui/Input";
  import { Select } from "@ui/Select";
  import { Textarea } from "@ui/Textarea";

  interface LLMNodeConfigProps {
    node: LLMNode;
    onChange: (updates: { label?: string; config?: Partial<LLMNode["config"]> }) => void;
  }

  const PROVIDERS = ["openai", "gemini", "anthropic"] as const;

  const MODEL_OPTIONS: Record<string, string[]> = {
    openai: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"],
    gemini: ["gemini-1.5-pro", "gemini-1.5-flash", "gemini-2.0-flash"],
    anthropic: ["claude-sonnet-4-20250514", "claude-3-5-haiku-20241022"],
  };
  ```

  Fields:
  - **Label** (`Input`): `node.label`, onChange dispatches `{ label }`
  - **Provider** (`Select`): `node.config.provider`, onChange dispatches `{ config: { provider, model: MODEL_OPTIONS[newProvider][0] } }` (auto-selects first model when provider changes)
  - **Model** (`Select`): `node.config.model`, options from `MODEL_OPTIONS[node.config.provider]`
  - **System Prompt** (`Textarea`): `node.config.system_prompt`, 4 rows
  - **Temperature** (`Input type="number"`): `node.config.temperature`, step 0.1, min 0, max 2
  - **Max Tokens** (`Input type="number"`): `node.config.max_tokens`, step 128, min 1

  Note: `input_map` and `output_key` are not editable in C1. They get a dedicated
  state wiring UI in C4. Show them as read-only info text at the bottom:
  "State wiring (input_map, output_key) configured in State panel (coming soon)."

  Each field change calls `onChange` immediately (controlled component pattern).
  No local form state, no submit button -- changes are live.

### 4. Create NodeConfigPanel container

- [ ] Create `packages/canvas/src/components/panels/NodeConfigPanel.tsx`:

  This is a **container component**. It reads from CanvasContext and graphSlice,
  then renders the appropriate config form.

  ```typescript
  import { useCallback, useMemo } from "react";
  import { Trash2 } from "lucide-react";
  import { useCanvasContext } from "@contexts/CanvasContext";
  import { useGraphStore } from "@store/graphSlice";
  import type { NodeSchema } from "@shared/schema";
  import { Sheet } from "@ui/Sheet";
  import { Button } from "@ui/Button";
  import { StartNodeConfig } from "./config/StartNodeConfig";
  import { LLMNodeConfig } from "./config/LLMNodeConfig";
  import { EndNodeConfig } from "./config/EndNodeConfig";

  export function NodeConfigPanel() {
    const { selectedNodeId, setSelectedNodeId } = useCanvasContext();
    const nodes = useGraphStore((s) => s.nodes);
    const updateNodeConfig = useGraphStore((s) => s.updateNodeConfig);
    const removeNode = useGraphStore((s) => s.removeNode);

    const selectedNode = useMemo(
      () => nodes.find((n) => n.id === selectedNodeId) ?? null,
      [nodes, selectedNodeId],
    );

    const handleChange = useCallback(
      (updates: { label?: string; config?: Record<string, unknown> }) => {
        if (selectedNodeId) {
          updateNodeConfig(selectedNodeId, updates);
        }
      },
      [selectedNodeId, updateNodeConfig],
    );

    const handleDelete = useCallback(() => {
      if (selectedNodeId) {
        removeNode(selectedNodeId);
        setSelectedNodeId(null);
      }
    }, [selectedNodeId, removeNode, setSelectedNodeId]);

    const handleClose = useCallback(() => {
      setSelectedNodeId(null);
    }, [setSelectedNodeId]);

    return (
      <Sheet
        open={!!selectedNode}
        onClose={handleClose}
        title={selectedNode ? `${selectedNode.type.toUpperCase()} Node` : ""}
        side="right"
      >
        {selectedNode && (
          <>
            {renderConfigForm(selectedNode, handleChange)}

            <div className="mt-6 border-t border-zinc-800 pt-4">
              <Button variant="ghost" onClick={handleDelete} className="text-red-400 hover:text-red-300">
                <Trash2 size={14} className="mr-1" />
                Delete Node
              </Button>
            </div>
          </>
        )}
      </Sheet>
    );
  }

  function renderConfigForm(
    node: NodeSchema,
    onChange: (updates: { label?: string; config?: Record<string, unknown> }) => void,
  ) {
    switch (node.type) {
      case "start":
        return <StartNodeConfig node={node} onChange={onChange} />;
      case "llm":
        return <LLMNodeConfig node={node} onChange={onChange} />;
      case "end":
        return <EndNodeConfig node={node} onChange={onChange} />;
      default:
        return <p className="text-xs text-zinc-500">No config available for this node type.</p>;
    }
  }
  ```

  The config panel uses the Sheet component (shadcn-style slide-over panel).
  Sheet handles the slide transition, close button, and scrollable content area.
  No backdrop overlay — the canvas stays visible and interactive.
  Content is conditionally rendered inside Sheet to avoid accessing null node properties.

### 5. Update App.tsx to include NodeConfigPanel

- [ ] Modify `packages/canvas/src/App.tsx` -- add `<NodeConfigPanel />` inside `<main>`:

  ```typescript
  import { NodeConfigPanel } from "./components/panels/NodeConfigPanel";
  // ... existing imports

  // Inside <main>:
  <main className="relative h-[calc(100vh-3rem)]">
    <GraphCanvas />
    <NodeConfigPanel />
  </main>
  ```

  The `relative` on main is needed for the panel's absolute positioning.

### 6. Write tests

- [ ] Create `packages/canvas/src/components/panels/config/__tests__/StartNodeConfig.test.tsx`:
  - Test: renders label input with current value
  - Test: changing label calls onChange with `{ label: "new value" }`
  - Test: shows description text about entry point

  ```typescript
  const mockNode: StartNode = {
    id: "1", type: "start", label: "Start",
    position: { x: 0, y: 0 }, config: {},
  };
  ```

- [ ] Create `packages/canvas/src/components/panels/config/__tests__/LLMNodeConfig.test.tsx`:
  - Test: renders all fields (label, provider, model, system prompt, temperature, max tokens)
  - Test: changing provider updates model options
  - Test: changing temperature calls onChange with config update
  - Test: system prompt textarea renders with current value
  - Test: shows state wiring info text

  ```typescript
  const mockNode: LLMNode = {
    id: "2", type: "llm", label: "Chat",
    position: { x: 0, y: 0 },
    config: {
      provider: "openai", model: "gpt-4o",
      system_prompt: "You are helpful.", temperature: 0.7,
      max_tokens: 1024, input_map: {}, output_key: "result",
    },
  };
  ```

- [ ] Create `packages/canvas/src/components/panels/__tests__/NodeConfigPanel.test.tsx`:

  Tests the container component that dispatches to the correct config form based on node type.
  Mock `CanvasContext` to provide `selectedNodeId`, mock `useGraphStore` to provide the node.

  - Test: renders nothing when no node is selected (selectedNodeId is null)
  - Test: renders StartNodeConfig when selected node is type "start"
  - Test: renders LLMNodeConfig when selected node is type "llm"
  - Test: renders EndNodeConfig when selected node is type "end"
  - Test: clicking close button calls setSelectedNodeId(null)
  - Test: clicking delete button calls removeNode and clears selection

- [ ] Create `packages/canvas/src/store/__tests__/graphSlice.updateNodeConfig.test.ts`:
  - Test: updates label only
  - Test: updates config only (partial merge)
  - Test: updates both label and config
  - Test: sets dirty to true
  - Test: does not affect other nodes

### 7. Verify

- [ ] Run `pnpm --filter @graphweave/canvas typecheck`
- [ ] Run `pnpm --filter @graphweave/canvas lint`
- [ ] Run `pnpm --filter @graphweave/canvas test`
- [ ] Run `pnpm --filter @graphweave/canvas dev` -- visually verify:
  - Click a node -- config panel slides in from right
  - Change label -- node updates on canvas immediately
  - Change provider -- model dropdown updates
  - Click X or click canvas background -- panel closes
  - Delete button removes the node

---

## What Could Go Wrong

| Risk | Detection | Rollback |
|------|-----------|----------|
| Config spread loses discriminated union type narrowing | tsc error on `as NodeSchema[]` | The cast is safe because we never change node type. Document in code comment. |
| Live config updates cause too many re-renders | Visual lag when typing in system prompt | Add debounce (300ms) on text fields only. Number fields and selects stay instant. |
| Panel overlaps canvas controls | Visual overlap with MiniMap/Controls | Adjust canvas padding-right or MiniMap position when panel is open |
| Model list hardcoded -- stale when providers update | Users see outdated models | Acceptable for C1. C3 fetches available models from `/settings/providers`. |
