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
  10. Condition nodes: default_branch validation (two sub-rules):
      a. For NON-EXHAUSTIVE types (field_equals, field_contains, field_exists,
         llm_router): default_branch must be non-empty AND reference a valid
         branch name (an outgoing edge's condition_branch). Empty string is
         invalid — the server-side check `if default_branch and ...` skips
         empty strings, causing the router to return "" which isn't in
         branch_map, crashing at runtime.
      b. For EXHAUSTIVE types (tool_error, iteration_limit): default_branch
         is ignored (the router always returns one of exactly 2 branches).
         Skip validation for these types.
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

## Required tests

| Test case | Priority |
|-----------|----------|
| Tool node with empty tool_name fails validation | HIGH |
| Tool node with empty output_key fails validation | HIGH |
| Condition node with no outgoing edges fails validation (rule 8) | HIGH |
| Condition node with edge missing condition_branch fails (rule 9) | HIGH |
| Condition node (field_equals) with empty default_branch fails (rule 10a) | HIGH |
| Condition node (field_equals) with default_branch not in edge branches fails (rule 10a) | HIGH |
| Condition node (tool_error) with empty default_branch passes (rule 10b, exhaustive) | HIGH |
| HumanInput node with empty prompt fails validation | HIGH |
| HumanInput node with empty input_key fails validation | HIGH |

## Verification

- `pnpm --filter canvas test` — all new test cases pass
- Existing validation tests still pass
- Manual: create a Tool node with empty tool_name, click Run — see toast error
- Manual: create a Condition node with no outgoing edges, click Run — see toast error
- Manual: create a field_equals Condition with empty default_branch, click Run — see toast error
- Manual: create a tool_error Condition with empty default_branch, click Run — no error (exhaustive)
