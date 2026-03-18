# Part 4.2 -- LLM input_map + output_key Config

## Goal

Give LLMNodeConfig the same wiring capabilities as ToolNodeConfig: a two-tier
input_map editor (collapsed summary / expanded card view) and an output_key field.
Remove the "State wiring coming soon" placeholder.

## Commit message

```
feat(canvas): add input_map and output_key config to LLM nodes

Replace the placeholder text with a full two-tier input mapping editor
matching the ToolNodeConfig pattern. Users can add/remove mapping rows,
select source fields from context-aware dropdowns, and configure the
output_key. Terminal LLM nodes hide the output_key field.
```

## Files to modify

| File | Change |
|------|--------|
| `packages/canvas/src/components/panels/config/LLMNodeConfig.tsx` | Add input_map editor, output_key field, collapsible Model Settings, contextual labels, remove placeholder |
| `packages/canvas/src/components/panels/config/ToolNodeConfig.tsx` | Update labels for consistency ("This node reads from", "Manage fields →", "+ New field..." option) |
| `packages/canvas/src/components/panels/config/presetUtils.ts` | No changes expected -- existing utilities work for LLM |
| `packages/canvas/src/components/panels/config/__tests__/LLMNodeConfig.test.tsx` | New test file |

## Design

### LLM vs Tool: what's different

| Aspect | ToolNodeConfig | LLMNodeConfig |
|--------|---------------|---------------|
| Parameter source | Tool registry (typed, named) | No registry -- manual rows only |
| Auto-map on select | Yes (tool change triggers auto-map) | No (no tool to select) |
| Row creation | Auto-created from tool params | User clicks "+ Add mapping" |
| Param name | Read-only (from registry) | Editable text input |
| isAutoFilled | true for registry params | Always false |
| Default output_key | `"tool_result"` | `"llm_response"` |
| Terminal hide | Same | Same |

### LLMNodeConfig layout (after changes)

The config panel is organized into collapsible sections to manage vertical
space. "Model Settings" defaults to collapsed after initial setup (provider
and model selected). System Prompt stays open since it's frequently edited.
"Data Wiring" (input mappings + output key) is always visible.

```
+-----------------------------------+
| Label: [My LLM_______________]   |
|                                   |
| ▸ Model Settings                  |   ← collapsed by default if provider+model set
|   Provider: [gemini________v]     |
|   Model:    [gemini-2.0-flash__v] |
|   Temperature: [0.7]             |
|   Max Tokens: [1024]             |
|                                   |
| System Prompt:                    |
| [You are a helpful assistant.  ]  |
| [                              ]  |
|                                   |
| This node reads from     [Manage fields →]
|   No mappings. Uses conversation  |
|   history (messages). To pass     |
|   specific data, add a mapping.   |
|   + Add mapping                   |
|                                   |
| --OR if rows exist--              |
| This node reads from     [Manage fields →]
|   query <- user_input             |
|   context <- tool_result          |
|   Customize                       |
|                                   |
| Result saved to                   |
|   Other nodes use this name to    |
|   access this LLM's output.      |
| [llm_response______________]     |
+-----------------------------------+
```

### Collapsible "Model Settings" section

Group Provider, Model, Temperature, Max Tokens into a collapsible section.
Default state:
- **Collapsed** if provider and model are both non-empty (user has already configured)
- **Expanded** on a fresh LLM node (needs initial setup)

Implementation: `useState` initialized from `!node.config.provider || !node.config.model`.
Use `ChevronRight` (collapsed) / `ChevronDown` (expanded) toggle, same pattern
as the existing input_map expanded/collapsed toggle.

### Contextual help labels

Replace technical labels with action-oriented descriptions:

| Before | After |
|--------|-------|
| "Input Mappings" | "This node reads from" |
| "Result saved to" | "Result saved to" (keep — already clear) |

Add a one-sentence helper below "Result saved to":
> "Other nodes use this name to access this LLM's output."

Add a "Manage fields →" link next to "This node reads from" that opens the
state panel (via `setStatePanelOpen(true)` from CanvasContext).

### Key UX detail: empty input_map hint

When input_map is empty, show a helpful hint instead of nothing:

```
No mappings configured. The LLM will use the conversation history
(messages field) as input. To pass specific data from other nodes,
add a mapping.
```

This explains both what happens by default AND when the user needs to act.
Avoids the assumption that all users are building conversational patterns.

### How rows work (manual add)

User clicks "+ Add mapping" -> new row appears with:
- Editable param name (text input, placeholder "param_name")
- Source dropdown (from `getRelevantFields`, type-filtered)
- Custom expression option

Since LLM has no parameter registry, all rows are `isAutoFilled: false` and
the param name is always editable.

### Reuse from ToolNodeConfig

The following can be extracted or reused directly:
- `toRows()` helper (identical)
- Collapsed row rendering (summary view)
- Expanded card rendering (Select + custom Input pattern)
- `buildPresetsForParam` / `getRelevantFields` / `isTerminalNode` utilities
- `toRecord` for persisting

The main difference: no `handleToolChange` auto-map logic, and an "Add row" button.

**Note on `handleProviderChange`**: Keep this referencing the static `MODEL_OPTIONS`
(or `FALLBACK_MODELS`) for now. Part 4.4 will replace it with a reactive memo
that prefers fetched models. Don't invest in making it reactive in this part.

**Consistency with ToolNodeConfig**: Also update ToolNodeConfig to use the same
labels ("This node reads from" instead of "Parameters", "Manage fields →" link,
"+ New field..." dropdown option). These small changes are done alongside the
LLM config to keep both panels consistent.

### Implementation approach: extract shared InputMapEditor

Rather than duplicating 200+ lines from ToolNodeConfig, extract a shared component:

```
InputMapEditor (new component)
  Props:
    rows: InputMapRow[]
    onRowsChange: (rows: InputMapRow[]) => void
    nodeId: string
    paramRegistry?: ToolParameter[]  // undefined for LLM
    allowAddRow: boolean             // true for LLM, false for Tool (registry-driven)
    defaultOutputKey: string         // "tool_result" | "llm_response"
    outputKey: string
    onOutputKeyChange: (key: string) => void
    isTerminal: boolean
```

Wait -- this extraction is complex and would require refactoring ToolNodeConfig
simultaneously. The simpler approach: copy the relevant JSX patterns into
LLMNodeConfig with LLM-specific adjustments. The duplication is manageable
(~80 lines of JSX) and avoids touching the stable ToolNodeConfig.

**Decision: copy pattern, don't extract shared component.** Extraction can happen
in a future refactoring pass when both configs are stable.

## Required tests

| Test | File | What it verifies |
|------|------|-----------------|
| Renders with empty input_map | LLMNodeConfig.test.tsx | Shows hint text, no rows |
| Add mapping row | LLMNodeConfig.test.tsx | Click "Add mapping" creates a new row with editable param |
| Remove mapping row | LLMNodeConfig.test.tsx | Click X removes row, calls onChange with updated input_map |
| Output_key hidden for terminal | LLMNodeConfig.test.tsx | When node -> End, output_key field not rendered |
| Output_key shown for non-terminal | LLMNodeConfig.test.tsx | Default "llm_response" in text input |
| Collapsed summary shows mappings | LLMNodeConfig.test.tsx | Each row shows param <- source |

## Verification steps

1. `pnpm tsc --noEmit` in canvas -- no type errors
2. `pnpm test` in canvas -- all tests pass
3. Manual: open LLM node config, verify placeholder is gone
4. Manual: add a mapping row, select source, verify collapsed/expanded views
5. Manual: connect LLM -> End, verify output_key hidden

## Detailed todolist

### LLMNodeConfig.tsx rewrite

- [ ] Open `packages/canvas/src/components/panels/config/LLMNodeConfig.tsx`

- [ ] Add imports:
  - [ ] `useGraphStore` from `@store/graphSlice` (for stateFields, nodes, edges)
  - [ ] `useSettingsStore` from `@store/settingsSlice` (already needed for providers -- see 4.4)
  - [ ] `{ getRelevantFields, isTerminalNode }` from `../../../utils/graphTraversal`
  - [ ] `{ type InputMapRow, buildPresetsForParam, resolveSourceLabel, getExpressionYieldType, getMappingWarning, toRecord }` from `./presetUtils`
  - [ ] `useState, useEffect, useMemo, useCallback` from react
  - [ ] Lucide icons: `Check, ChevronDown, ChevronRight, X, Plus`
  - [ ] Change props to accept `LLMNode` type from schema (not inline interface)

- [ ] Update interface:
  ```typescript
  interface LLMNodeConfigProps {
    node: LLMNode;
    onChange: (updates: { label?: string; config?: Partial<LLMNode["config"]> }) => void;
  }
  ```

- [ ] Add state hooks inside component:
  - [ ] `const stateFields = useGraphStore((s) => s.graph?.state ?? [])`
  - [ ] `const graphNodes = useGraphStore((s) => s.nodes)`
  - [ ] `const edges = useGraphStore((s) => s.edges)`
  - [ ] `const [rows, setRows] = useState<InputMapRow[]>(() => toRows(node.config.input_map))`
  - [ ] `const [expanded, setExpanded] = useState(false)`

- [ ] Add computed values:
  - [ ] `relevantFields` via `useMemo` calling `getRelevantFields`
  - [ ] `isTerminal` via `useMemo` calling `isTerminalNode`
  - [ ] `allMapped = rows.length > 0 && rows.every(r => r.stateKey !== "")`

- [ ] Add `toRows` helper (same as ToolNodeConfig -- convert Record to InputMapRow[])

- [ ] Add row reset effect keyed on `node.id`:
  ```typescript
  useEffect(() => {
    setRows(toRows(node.config.input_map).map(row => ({
      ...row, customMode: row.stateKey !== "" && !allPresets.some(p => p.value === row.stateKey),
    })));
  }, [node.id]);
  ```

- [ ] Add auto-reset for terminal nodes (same pattern as ToolNodeConfig):
  ```typescript
  useEffect(() => {
    if (isTerminal && !node.config.output_key.trim()) {
      onChange({ config: { output_key: "llm_response" } });
    }
  }, [isTerminal, node.config.output_key, onChange]);
  ```

- [ ] Add handler: `handleAddRow` -- appends `{ param: "", stateKey: "", isAutoFilled: false, customMode: false }` to rows

- [ ] Add handlers (copy pattern from ToolNodeConfig, adjust):
  - [ ] `handleSelectChange(index, value)` -- same logic
  - [ ] `handleCustomInputChange(index, value)` -- same logic
  - [ ] `handleParamChange(index, value)` -- same logic (always editable for LLM)
  - [ ] `handleRemoveRow(index)` -- same logic
  - [ ] `handleOutputKeyChange(e)` -- same as ToolNodeConfig

- [ ] Render existing fields (keep Label, Provider, Model, System Prompt, Temperature, Max Tokens as-is)

- [ ] Remove the placeholder paragraph: `<p>State wiring (input_map, output_key) configured in State panel (coming soon).</p>`

- [ ] Add Input Mappings section after the temperature/max_tokens grid:
  - [ ] Section header: "Input Mappings"
  - [ ] If `rows.length === 0`: show hint text + "Add mapping" button
    ```
    No explicit mappings -- LLM reads from message history.
    ```
  - [ ] If `rows.length > 0 && !expanded`: collapsed summary view (same JSX pattern as ToolNodeConfig but with editable param names in summary too)
  - [ ] If `rows.length > 0 && expanded`: card editor view (same JSX pattern as ToolNodeConfig)
  - [ ] Always show "+ Add mapping" button at bottom of rows section

- [ ] Add output_key section (hidden when `isTerminal`):
  ```tsx
  {!isTerminal && (
    <div>
      <label ...>Result saved to</label>
      <Input value={node.config.output_key} onChange={handleOutputKeyChange} placeholder="llm_response" />
    </div>
  )}
  ```

### Tests

- [ ] Create `packages/canvas/src/components/panels/config/__tests__/LLMNodeConfig.test.tsx`
  - [ ] Test: renders without crashing with default LLM config
  - [ ] Test: shows "No explicit mappings" hint when input_map is empty
  - [ ] Test: "Add mapping" button creates a new row
  - [ ] Test: output_key field shows "llm_response" by default
  - [ ] Test: output_key field hidden when node is terminal (mock edges to End)
  - [ ] Test: removing a row calls onChange with updated input_map

### Verify

- [ ] `cd packages/canvas && pnpm tsc --noEmit`
- [ ] `cd packages/canvas && pnpm test`
