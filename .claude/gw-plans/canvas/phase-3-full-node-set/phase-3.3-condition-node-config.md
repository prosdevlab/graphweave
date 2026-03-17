# Phase 3.3 — ConditionNode Config + Edge Wiring

## Goal

Add ConditionNodeConfig panel supporting all 6 condition types. Wire
`condition_branch` onto edges from condition nodes. Show branch names
as edge labels on canvas. Derive `config.branches` from edges at save time.

## Files to modify

| File | Action |
|------|--------|
| `packages/canvas/src/components/panels/config/ConditionNodeConfig.tsx` | New |
| `packages/canvas/src/components/panels/config/ConditionBranchEditor.tsx` | New |
| `packages/canvas/src/components/panels/NodeConfigPanel.tsx` | Add condition case |
| `packages/canvas/src/components/canvas/nodes/ConditionNode.tsx` | Enhance |
| `packages/canvas/src/components/canvas/GraphCanvas.tsx` | Modify onConnect, onReconnect, isValidConnection |
| `packages/canvas/src/hooks/useNodePlacement.ts` | Preserve condition_branch in spliceEdge |
| `packages/canvas/src/store/graphSlice.ts` | Add `updateEdge`, branch sync |
| `packages/canvas/src/types/mappers.ts` | Pass condition_branch through |

## Design

### Edge wiring flow

```
  User drags edge from Condition → Target
       |
       v
  onConnect fires
       |
       looks up source node type via storeNodes
       (storeNodes already subscribed at top of GraphCanvas —
        add to onConnect's useCallback dependency array)
       |
       checks: is source a condition node?
       |
   yes |                          no
       v                           v
  count existing edges from       normal edge
  source (storeEdges.filter)      (no branch)
  auto-set condition_branch
  = "branch_N" (count + 1)
       |
       v
  edge appears on canvas with label "branch_N"

  Later, in ConditionNodeConfig:
  ConditionBranchEditor shows all outgoing edges
  User can rename "branch_1" → "yes", "branch_2" → "no"
```

### onReconnect — preserve condition_branch when rewiring

`onReconnect` (GraphCanvas.tsx ~line 203) creates a new edge with only
`id/source/target`. If the old edge had a `condition_branch`, it is lost.

```
  Before rewire:
  [Condition] ──yes──→ [LLM]

  User drags edge target from LLM to Tool:

  WRONG (current):   [Condition] ────────→ [Tool]     (branch lost!)
  CORRECT (planned):  [Condition] ──yes──→ [Tool]     (branch preserved)
```

Fix: In `onReconnect`, read `oldEdge.data?.condition_branch` (via the RF edge)
or look up the store edge's `condition_branch`. Copy it to the new edge.
If the source changed (not just target), and the new source is a condition
node, auto-assign a branch name.

### isValidConnection — allow multiple condition edges to same target

Current `isValidConnection` rejects duplicate `source→target` pairs. But
condition nodes legitimately route multiple branches to the same target
(e.g., both "on_error" and "on_success" → End).

```
  Valid graph that current validation blocks:

  [Condition] ──on_error──→ [End]
              ──on_success─→ [End]    ← BLOCKED by duplicate check
```

Fix: When source is a condition node, skip the duplicate-edge check.
Each edge gets a unique `condition_branch` via auto-assignment anyway.

### spliceEdge — preserve condition_branch on drop-on-edge

`useNodePlacement.ts` splits an edge into two when dropping a node on it.
Neither new edge inherits `condition_branch` from the original.

```
  Before drop:
  [Condition] ──yes──→ [End]

  User drops Tool node on the edge:

  WRONG (current):
  [Condition] ────→ [Tool] ────→ [End]     (branch lost!)

  CORRECT (planned):
  [Condition] ──yes──→ [Tool] ────→ [End]  (branch on first segment)
```

Fix: In `useNodePlacement.ts`, when the original edge has `condition_branch`,
copy it to `newEdge1` (original source → inserted node). `newEdge2`
(inserted node → original target) does NOT get a branch — the inserted
node is not a condition node.

### Edge deletion — destructive for branch data (known limitation)

Deleting an edge from a condition node permanently removes that branch.
No undo system exists. This is acceptable for now but should be
documented. Consider adding a confirmation dialog when deleting edges
from condition nodes in a future polish pass.

### Branch auto-naming — collision avoidance

Simple count-based naming (`branch_N` where N = count + 1) creates
duplicates after deletions. Example:

```
  Create: branch_1, branch_2, branch_3
  Delete: branch_2
  Create: branch_3  ← DUPLICATE!
```

Fix: Parse existing branch names, find the highest N, use N + 1:

```typescript
const existing = storeEdges
  .filter((e) => e.source === sourceId && e.condition_branch)
  .map((e) => e.condition_branch!);
const maxN = existing.reduce((max, name) => {
  const m = name.match(/^branch_(\d+)$/);
  return m ? Math.max(max, Number(m[1])) : max;
}, 0);
const branchName = `branch_${maxN + 1}`;
```

### Edge label display

```
  Before (no labels):

  [Condition] ──────────→ [LLM]
              ──────────→ [End]

  After (with condition_branch labels):

  [Condition] ──branch_1──→ [LLM]
              ──branch_2──→ [End]

  After user renames:

  [Condition] ────yes────→ [LLM]
              ────no─────→ [End]
```

### Mapper changes (CRITICAL — condition_branch round-trip)

The `@xyflow/react` `Edge` type supports a generic `data` parameter. Both
mapper functions must preserve `condition_branch` through the round-trip,
or branch data is silently lost on every store↔RF sync cycle.

**`toRFEdge`** — read from `EdgeSchema`, put on RF edge `data` + `label`:
```typescript
type GWEdgeData = { condition_branch?: string; label?: string };

export function toRFEdge(edge: EdgeSchema): Edge<GWEdgeData> {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    // RF label is for display only — condition_branch takes priority
    label: edge.condition_branch ?? edge.label,
    // Store both original label AND condition_branch in data for lossless round-trip
    data: { condition_branch: edge.condition_branch, label: edge.label },
  };
}
```

**`toEdgeSchema`** — extract from RF edge `data` back to `EdgeSchema`.
Read `label` from `data.label` (not from RF `label` which may be the
condition_branch display value):
```typescript
export function toEdgeSchema(rfEdge: Edge<GWEdgeData>): EdgeSchema {
  return {
    id: rfEdge.id,
    source: rfEdge.source,
    target: rfEdge.target,
    // Read original label from data, not from RF label (which may be condition_branch)
    label: rfEdge.data?.label,
    condition_branch: rfEdge.data?.condition_branch,
  };
}
```

This prevents data drift: RF `label` is display-only, while `data` holds
the canonical values for the lossless round-trip.

**Test required** (`mappers.test.ts`): round-trip an edge with
`condition_branch: "yes"` through `toRFEdge` → `toEdgeSchema` and
verify the value survives.

### graphSlice additions

**`updateEdge` action** — add to `GraphSlice` interface AND implementation:
```typescript
// In GraphSlice interface:
updateEdge: (id: string, updates: Partial<EdgeSchema>) => void;

// In create() implementation:
updateEdge: (id, updates) =>
  set((s) => ({
    edges: s.edges.map((e) => (e.id === id ? { ...e, ...updates } : e)),
    dirty: true,
  })),
```

ConditionBranchEditor calls `useGraphStore(s => s.updateEdge)` to rename
branches. The store change triggers the storeEdges → toRFEdge → RF sync
cycle, updating the edge label on canvas.

**Branch sync in `saveGraph` (CRITICAL — bridges visual↔execution)**

Without this step, `config.branches` remains `{}` and the builder raises
`GraphBuildError` ("Edge from condition node missing condition_branch").

Insert the sync **inside `saveGraph`**, between reading state and constructing
the API payload. Replace `state.nodes` with `syncedNodes` in the schema:

```typescript
// In saveGraph, BEFORE constructing the schema payload:
const syncedNodes = state.nodes.map((node) => {
  if (node.type !== "condition") return node;
  const outEdges = state.edges.filter(
    (e) => e.source === node.id && e.condition_branch
  );
  const branches: Record<string, string> = {};
  for (const e of outEdges) {
    branches[e.condition_branch!] = e.target;
  }
  return { ...node, config: { ...node.config, branches } };
});

// Use syncedNodes (not state.nodes) when building the schema
const schema = { ...graphMeta, nodes: syncedNodes, edges: state.edges };
```

**Test required** (`graphSlice.test.ts`): create a condition node with
outgoing edges that have `condition_branch`, call `saveGraph`, verify the
serialized payload has `config.branches` populated correctly.

### ConditionNodeConfig layout

**field_equals example (with default_branch):**
```
  +------------------------------------------+
  | Label                                    |
  | [___________________________________]    |
  |                                          |
  | Condition Type                           |
  | [field_equals                       v]   |
  |                                          |
  | Field                                    |
  | [status____________________________ ]    |
  | Value                                    |
  | [approved__________________________ ]    |
  | Match Branch                             |
  | [yes________________________________]    |
  |                                          |
  | Default Branch (when condition fails)    |
  | [no                                 v]   |  ← dropdown from edge branches
  |                                          |
  | Outgoing Branches                        |
  | +--------------------------------------+ |
  | | yes → LLM Node                       | |
  | | no  → End Node                       | |
  | +--------------------------------------+ |
  |                                          |
  | When "Match Branch" changes, the         |
  | corresponding edge label auto-updates.   |
  +------------------------------------------+
```

**tool_error example (exhaustive — no default_branch):**
```
  +------------------------------------------+
  | Label                                    |
  | [___________________________________]    |
  |                                          |
  | Condition Type                           |
  | [tool_error                         v]   |
  |                                          |
  | On Error Branch                          |
  | [error______________________________]    |
  | On Success Branch                        |
  | [success____________________________]    |
  |                                          |
  | Outgoing Branches                        |
  | +--------------------------------------+ |
  | | error   → Retry Node                 | |
  | | success → LLM Node                   | |
  | +--------------------------------------+ |
  |                                          |
  | This condition always matches exactly    |
  | one of the two branches.                 |
  +------------------------------------------+
```

**llm_router example:**
```
  +------------------------------------------+
  | Label                                    |
  | [___________________________________]    |
  |                                          |
  | Condition Type                           |
  | [llm_router                         v]   |
  |                                          |
  | Prompt                                   |
  | [Classify the user's intent:        ]    |
  | [_________________________________  ]    |
  | Options (comma-separated)                |
  | [positive, negative, neutral________]    |
  | Routing Model (optional)                 |
  | [gpt-4o-mini________________________]    |
  |                                          |
  | Default Branch (when no option matches)  |
  | [neutral                            v]   |  ← dropdown from edge branches
  |                                          |
  | Outgoing Branches                        |
  | +--------------------------------------+ |
  | | positive → Happy Path                 | |
  | | negative → Escalate                   | |
  | | neutral  → Default                    | |
  | +--------------------------------------+ |
  +------------------------------------------+
```

### CRITICAL — branch name coupling between config and edges

The builder's router functions return branch names from `condition` config
fields. `add_conditional_edges` maps against `branch_map` keys from
`edge.condition_branch`. **These must be the same strings or the graph
crashes at runtime.**

```
  Router returns:                 branch_map expects:
  ─────────────                   ──────────────────
  field_equals:  condition["branch"]     edge.condition_branch values
  field_contains: condition["branch"]    edge.condition_branch values
  field_exists:  condition["branch"]     edge.condition_branch values
  llm_router:    one of condition["options"]  edge.condition_branch values
  tool_error:    condition["on_error"] or ["on_success"]  edge.condition_branch values
  iteration_limit: condition["exceeded"] or ["continue"]  edge.condition_branch values
```

**Design decision: condition config values drive edge branch names.**

For field-based conditions (`field_equals`, `field_contains`, `field_exists`):
- The `branch` field in the condition config is the "match" branch name
- When the user changes `branch`, auto-rename the corresponding edge's
  `condition_branch` to match
- `default_branch` handles the "no match" case

For exhaustive conditions (`tool_error`, `iteration_limit`):
- The condition config defines exactly 2 branch names
  (`on_error`/`on_success` or `exceeded`/`continue`)
- When the user edits these, auto-rename the corresponding edges
- `default_branch` is not used (hide the dropdown for these types)

For `llm_router`:
- `options` array defines the branch names the LLM can return
- When options change, edges should be renamed to match
- `default_branch` handles "no match" case

### Condition type forms

| Type | Config fields | Branch names produced |
|------|---------------|----------------------|
| `field_equals` | field, value, branch | `branch` value + `default_branch` |
| `field_contains` | field, value (label "Contains"), branch | `branch` value + `default_branch` |
| `field_exists` | field, branch | `branch` value + `default_branch` |
| `llm_router` | prompt (Textarea), options (comma-separated), routing_model (optional) | each option + `default_branch` |
| `tool_error` | on_error, on_success | exactly `on_error` + `on_success` (no default) |
| `iteration_limit` | field, max (number), exceeded, continue | exactly `exceeded` + `continue` (no default) |

### Condition defaults (reset on type change)

These are defaults for `config.condition` only (the inner ConditionConfig).
Type change resets `config.condition` but **preserves** `config.branches`
and `config.default_branch`.

```typescript
// These apply to config.condition ONLY, not the full config
const CONDITION_CONFIG_DEFAULTS: Record<string, ConditionConfig> = {
  field_equals:    { type: "field_equals", field: "", value: "", branch: "yes" },
  field_contains:  { type: "field_contains", field: "", value: "", branch: "yes" },
  field_exists:    { type: "field_exists", field: "", branch: "yes" },
  llm_router:      { type: "llm_router", prompt: "", options: [] },
  tool_error:      { type: "tool_error", on_error: "error", on_success: "success" },
  iteration_limit: { type: "iteration_limit", field: "", max: 5, exceeded: "exceeded", continue: "continue" },
};

// On type change:
onChange({
  config: {
    condition: CONDITION_CONFIG_DEFAULTS[newType],
    // preserve branches and default_branch — they are edge-derived
  },
});
```

### Default Branch behavior per condition type

```
  field_equals / field_contains / field_exists:
  +------------------------------------------+
  | Default Branch                           |
  | [branch_2                           v]   |  ← dropdown from edge branches
  +------------------------------------------+
  Router uses default_branch when condition does NOT match.

  tool_error / iteration_limit:
  +------------------------------------------+
  | (Default Branch hidden — router is       |
  |  exhaustive, always returns one of two)  |
  +------------------------------------------+

  llm_router:
  +------------------------------------------+
  | Default Branch                           |
  | [fallback                           v]   |  ← dropdown from edge branches
  +------------------------------------------+
  Router uses default_branch when LLM response doesn't match any option.
```

### ConditionNode presenter enhancement

Show condition type badge + branch count:

```
  +---------------------------+
  |  [GitBranch]  Condition   |
  |  FIELD_EQUALS  2 branches |
  +---------------------------+
```

### Full UX flow: condition edge wiring

```
  Step 1: User places a Condition node

  ┌──────────────┐
  │ ⑂ Condition  │
  │ FIELD_EQUALS │                  (no edges yet)
  └──────────────┘

  Step 2: User drags edge to LLM node → auto-labeled "branch_1"

  ┌──────────────┐  ──branch_1──→  ┌───────┐
  │ ⑂ Condition  │                 │  LLM  │
  └──────────────┘                 └───────┘

  Step 3: User drags edge to End node → auto-labeled "branch_2"

  ┌──────────────┐  ──branch_1──→  ┌───────┐
  │ ⑂ Condition  │                 │  LLM  │
  │              │  ──branch_2──→  ┌───────┐
  └──────────────┘                 │  End  │
                                   └───────┘

  Step 4: User clicks Condition node → config panel opens
          ConditionBranchEditor at bottom shows:

  +------------------------------------------+
  | Outgoing Branches                        |
  | +--------------------------------------+ |
  | | [yes____] → LLM                      | |
  | | [no_____] → End                      | |
  | +--------------------------------------+ |
  +------------------------------------------+

  Step 5: Canvas updates with renamed labels

  ┌──────────────┐  ────yes────→  ┌───────┐
  │ ⑂ Condition  │               │  LLM  │
  │ FIELD_EQUALS │  ────no─────→  ┌───────┐
  │ 2 branches   │               │  End  │
  └──────────────┘               └───────┘

  Step 6: On save, graphSlice derives config.branches:
          { "yes": "<llm-node-id>", "no": "<end-node-id>" }
```

### ConditionBranchEditor: duplicate prevention

Reject duplicate branch names — if two branches have the same name,
`config.branches` (a `Record<string, string>`) silently drops one.
Show inline validation error on the duplicate input.

## Required tests

| Test file | Test case | Priority |
|-----------|-----------|----------|
| `mappers.test.ts` | Round-trip edge with `condition_branch` through toRFEdge → toEdgeSchema | HIGH |
| `mappers.test.ts` | Round-trip preserves original `label` separately from `condition_branch` | HIGH |
| `graphSlice.test.ts` | saveGraph derives `config.branches` from condition edges | HIGH |
| `GraphCanvas.test.tsx` | onConnect from condition node auto-assigns `condition_branch` | HIGH |
| `GraphCanvas.test.tsx` | onReconnect preserves `condition_branch` from old edge | HIGH |
| `GraphCanvas.test.tsx` | isValidConnection allows multiple edges from condition to same target | HIGH |
| `GraphCanvas.test.tsx` | Auto-branch naming avoids collisions after deletions | MEDIUM |
| `useNodePlacement.test.ts` | spliceEdge on condition edge preserves `condition_branch` on first segment | HIGH |
| `ConditionBranchEditor.test.tsx` | Rejects duplicate branch names | HIGH |
| `ConditionBranchEditor.test.tsx` | Renaming branch calls updateEdge with new condition_branch | MEDIUM |
| `ConditionNodeConfig.test.tsx` | Type change resets `config.condition` but preserves `branches`/`default_branch` | HIGH |
| `ConditionNodeConfig.test.tsx` | `tool_error`/`iteration_limit` hide Default Branch dropdown | MEDIUM |
| `graphSlice.test.ts` | saveGraph synced `default_branch` is a key in derived `branches` | HIGH |

## Verification

- `tsc --noEmit` passes
- All tests above pass
- Connect edge from Condition → any node: edge auto-gets branch label
- Reconnect condition edge to new target: branch label preserved
- Drop node on condition edge: first segment keeps branch label
- Multiple edges from condition to same target: allowed
- Branch label visible on canvas
- ConditionBranchEditor: rename a branch, label updates on canvas
- ConditionBranchEditor: duplicate name shows inline error
- Change condition type: form resets condition config, preserves branches/default_branch
- tool_error/iteration_limit: Default Branch dropdown hidden
- field_equals: changing "Match Branch" auto-renames the edge label
- llm_router: changing options auto-renames corresponding edges
- Save + reload: branches persist correctly
- `config.branches` correctly derived from edges at save time
- End-to-end: build Start → LLM → Condition(field_equals) → End graph, run it, verify routing works
