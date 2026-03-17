# Phase 3.5 — Validation Rules for New Nodes

## Goal

Add client-side validation rules for tool, condition, and human_input nodes.
These run before `POST /run` to give fast feedback.

## Files to modify

| File | Action |
|------|--------|
| `packages/canvas/src/utils/validateGraph.ts` | Add 6 new rules |
| `packages/canvas/src/utils/__tests__/validateGraph.test.ts` | Add test cases |

## Design

### New rules (after existing rules 1-5)

```
  Existing rules:
  1. Exactly one Start node
  2. At least one End node
  3. All non-end nodes have outgoing edges
  4. All non-start nodes have incoming edges
  5. LLM nodes have non-empty system_prompt

  New rules:
  6. Tool nodes: tool_name must not be empty
  7. Tool nodes: output_key must not be empty
  8. Condition nodes: must have at least one outgoing edge with condition_branch
  9. Condition nodes: all outgoing edges must have condition_branch set
  10. Condition nodes: default_branch must reference a valid branch name
      (matches server-side validation in builder.py line 253-258)
  11. HumanInput nodes: prompt must not be empty
  12. HumanInput nodes: input_key must not be empty
```

### Error message format

Follow existing pattern — use the node's label for context:

```
  "LLM node needs a system prompt"        (existing)
  "My Tool node needs a tool selected"     (new)
  "Condition node has edges without branch names"  (new)
  "Human Input node needs a prompt"        (new)
```

### Type narrowing

Narrow with `node.type === "tool"` before accessing `config.tool_name`,
following the existing LLM pattern (rule 5).

## Verification

- `pnpm --filter canvas test` — all new test cases pass
- Existing validation tests still pass
- Manual: create a Tool node with empty tool_name, click Run — see toast error
- Manual: create a Condition node with no outgoing edges, click Run — see toast error
