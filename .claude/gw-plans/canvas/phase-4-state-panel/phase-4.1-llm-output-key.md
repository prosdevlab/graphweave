# Part 4.1 -- LLM output_key Clean Break

## Goal

Change the LLM node default `output_key` from `"messages"` to `"llm_response"`.
Update the execution layer so the conversation buffer (`messages`) still works.
Remove the reducer-aware workaround and TODO breadcrumbs.

## Commit message

```
feat: change LLM default output_key to llm_response

Switch LLM nodes from writing directly to messages (append reducer) to
writing to a dedicated llm_response field (replace reducer). The
execution layer now appends an AIMessage to messages automatically,
preserving the conversation buffer.

Removes the reducer-aware workaround in classifyFields and TODO
breadcrumbs in nodeDefaults.ts and runInputUtils.ts.
```

## Files to modify

| File | Change |
|------|--------|
| `packages/canvas/src/utils/nodeDefaults.ts` | Change LLM default output_key from `"messages"` to `"llm_response"`. Remove TODO comment block. |
| `packages/execution/app/builder.py` | Update `_make_llm_node` to also return `messages: [AIMessage(...)]` when output_key != "messages". |
| `packages/canvas/src/components/canvas/runInputUtils.ts` | Simplify `classifyFields` -- remove reducer-aware workaround. Remove TODO comment. |
| `packages/canvas/src/components/canvas/__tests__/runInputUtils.test.ts` | Update tests that rely on `output_key: "messages"` behavior. |
| `packages/canvas/src/store/graphSlice.ts` | Add `llm_response` to DEFAULT_STATE. Fix saveGraph auto-registration to use `type: "string"` for LLM nodes. |
| `packages/execution/tests/unit/test_builder.py` | Add test for new dual-write behavior in `_make_llm_node`. |

## Design

### 1. nodeDefaults.ts change

```typescript
// BEFORE
config: {
  // TODO (long-term): this default causes ... [20 lines]
  output_key: "messages",
}

// AFTER
config: {
  output_key: "llm_response",
}
```

### 2. builder.py _make_llm_node change

The LLM node function currently returns `{config["output_key"]: response.content}`.
After this change, it also appends an `AIMessage` to `messages` to maintain the
conversation buffer -- but only when `output_key != "messages"` (to avoid double-write).

```python
# BEFORE
async def llm_node(state: dict) -> dict:
    # ... invoke LLM ...
    return {config["output_key"]: response.content}

# AFTER
async def llm_node(state: dict) -> dict:
    # ... invoke LLM ...
    result = {config["output_key"]: response.content}
    # Maintain conversation buffer when writing to a dedicated field
    if config["output_key"] != "messages":
        result["messages"] = [response]  # AIMessage, add_messages reducer appends
    return result
```

Key insight: `response` is already an `AIMessage` object (returned by `llm.ainvoke()`).
The `add_messages` reducer on `messages` will append it. We return the raw object,
not `.content`, so LangChain message metadata (role, etc.) is preserved.

**Safety guard**: The dual-write should also check that `messages` exists in the
state definition. If a user somehow removes `messages` (bypassing the readonly
guard), the dual-write would cause a LangGraph error. Guard defensively:

```python
result = {config["output_key"]: response.content}
if config["output_key"] != "messages" and "messages" in state:
    result["messages"] = [response]
return result
```

The `"messages" in state` check ensures we only write to keys that exist in the
state annotation. This is defense-in-depth alongside the readonly guard in
`removeStateFields`.

### 3. classifyFields — keep reducer check, remove only the TODO

The `|| f.reducer !== "replace"` clause is NOT just an LLM workaround — it's a
legitimate feature for any multi-contributor field. Example: a Tool node with
`output_key: "meta"` where `meta` has `reducer: "merge"`. The user should still
be able to provide initial values via the run dialog.

```typescript
// BEFORE
// Use reducer semantics to determine ... [long TODO comment]
const inputFields = state.filter(
  (f) => !outputKeys.has(f.key) || f.reducer !== "replace",
);

// AFTER — same logic, remove only the TODO/workaround framing
// Fields with append/merge reducers have multiple contributors —
// a node writing to them does not prevent the user from providing
// an initial value (e.g. messages, or any merge-reducer field).
const inputFields = state.filter(
  (f) => !outputKeys.has(f.key) || f.reducer !== "replace",
);
```

Remove the TODO comment referencing `nodeDefaults.ts`. Keep the reducer check.
Remove the "workaround" framing — this is intentional behavior.

### 4. Add `llm_response` to DEFAULT_STATE

The auto-registration in `saveGraph` creates fields with `type: "object"` by
default. But `llm_response` holds a string (`response.content`). To avoid
type mismatch warnings in the UI, add `llm_response` to the default state
fields alongside `messages` and `user_input`:

```typescript
// In graphSlice.ts or wherever DEFAULT_STATE is defined
{ key: "llm_response", type: "string", reducer: "replace" }
```

This ensures the field exists with the correct type from the start.

### 5. Test updates

In `runInputUtils.test.ts`, update LLM node fixtures to use `output_key: "llm_response"`.
Keep all existing merge/append reducer tests — they are NOT workaround tests.
Add a new test: LLM with `output_key: "llm_response"` — verify `messages` stays
in inputFields and `llm_response` is excluded. Add a test for
`getConsumedInputFields` with the new default to ensure the run dialog works.

### 6. Fix saveGraph auto-registration type for LLM nodes

In `graphSlice.ts`, the `saveGraph` function auto-registers output_keys not found
in state with `type: "object"`. This is correct for Tool nodes (which return
structured data) but wrong for LLM nodes (which return `response.content`, a string).

```typescript
// BEFORE (graphSlice.ts, ~line 248)
newFields.push({ key: outputKey, type: "object", reducer: "replace" });

// AFTER — check node type
const fieldType = node.type === "llm" ? "string" : "object";
newFields.push({ key: outputKey, type: fieldType, reducer: "replace" });
```

This ensures that even user-customized LLM output_keys (e.g. `summary` instead
of `llm_response`) get the correct type in state.

## Required tests

| Test | File | What it verifies |
|------|------|-----------------|
| LLM node dual-write | `test_builder.py` | `_make_llm_node` returns both `llm_response` and `messages` keys |
| LLM node messages-compat | `test_builder.py` | When output_key IS "messages", no double-write (old behavior) |
| classifyFields with llm_response | `runInputUtils.test.ts` | `llm_response` excluded from inputFields, `messages` included |
| classifyFields keeps merge/append | `runInputUtils.test.ts` | Existing merge/append reducer tests still pass (not deleted) |
| getConsumedInputFields with llm_response | `runInputUtils.test.ts` | Run dialog shows `messages` for LLM with empty input_map |
| LLM dual-write skips when messages missing | `test_builder.py` | When `messages` not in state, LLM node returns only `llm_response` (no crash) |
| saveGraph LLM auto-registration type | `graphSlice.test.ts` | LLM output_key auto-registered as `type: "string"`, tool as `type: "object"` |
| DEFAULT_STATE includes llm_response | `graphSlice.test.ts` | New graph state includes `llm_response` with `type: "string"` |

## Deployment note

Part 4.1 changes both frontend (`nodeDefaults.ts`, `graphSlice.ts`) and execution
(`builder.py`). The dual-write in `builder.py` must be deployed first. If the
frontend deploys first, new LLM nodes write to `llm_response` but the execution
layer won't dual-write to `messages`, silently breaking conversation history.

**For solo dev with Docker**: this is handled by `docker-compose up --build` which
rebuilds both layers simultaneously. No ordering concern in practice.

**Run flow safety**: Confirmed that `CanvasHeader.handleRun` calls
`await saveGraph()` before starting execution. This ensures `llm_response` is
in the schema state (via DEFAULT_STATE + auto-registration) when it reaches the
execution layer.

## Verification steps

1. `cd packages/canvas && pnpm tsc --noEmit` -- no type errors
2. `cd packages/canvas && pnpm test` -- all runInputUtils tests pass
3. `cd packages/execution && uv run pytest tests/unit/test_builder.py -v` -- new tests pass
4. `cd packages/execution && uv run pytest tests/unit/test_state_utils.py -v` -- existing tests still pass

## Detailed todolist

### Canvas changes

- [ ] Open `packages/canvas/src/utils/nodeDefaults.ts`
  - [ ] In the `llm` config, change `output_key: "messages"` to `output_key: "llm_response"`
  - [ ] Remove the TODO comment block (lines 20-28 approx)

- [ ] Open `packages/canvas/src/components/canvas/runInputUtils.ts`
  - [ ] In `classifyFields`, remove the TODO comment block (lines 127-139) and the "workaround" framing
  - [ ] Replace with a clear comment: "Fields with append/merge reducers have multiple contributors..."
  - [ ] Keep the filter logic unchanged: `(f) => !outputKeys.has(f.key) || f.reducer !== "replace"`
  - [ ] Remove the TODO comment referencing nodeDefaults.ts

- [ ] Add `llm_response` to DEFAULT_STATE in graphSlice.ts (or wherever defaults are defined)
  - [ ] `{ key: "llm_response", type: "string", reducer: "replace" }`
- [ ] Fix `saveGraph` auto-registration: when a node is type `"llm"`, auto-register
  its output_key with `type: "string"` instead of `type: "object"` (LLM output is
  always `response.content`, a string)

- [ ] Open `packages/canvas/src/components/canvas/__tests__/runInputUtils.test.ts`
  - [ ] Find all LLM node fixtures with `output_key: "messages"` and change to `output_key: "llm_response"`
  - [ ] Keep ALL existing merge/append reducer tests — they are NOT workaround tests
  - [ ] Add a test: LLM node with `output_key: "llm_response"` — verify `messages` is in inputFields and `llm_response` is NOT
  - [ ] Add a test: `getConsumedInputFields` with LLM (output_key: "llm_response", empty input_map) — verify `messages` in consumedFields

### Execution changes

- [ ] Open `packages/execution/app/builder.py`
  - [ ] Import `AIMessage` if not already imported (it's not -- only `HumanMessage` and `SystemMessage` are imported)
    - Actually, `response` from `llm.ainvoke()` is already an `AIMessage` -- no import needed
  - [ ] In `_make_llm_node`, after `response = await llm.ainvoke(messages)`:
    - Change `return {config["output_key"]: response.content}` to:
    ```python
    result = {config["output_key"]: response.content}
    if config["output_key"] != "messages":
        result["messages"] = [response]
    return result
    ```

- [ ] Open or create test for dual-write in `packages/execution/tests/unit/test_builder.py`
  - [ ] Add test: LLM node with `output_key: "llm_response"` returns both keys
  - [ ] Add test: LLM node with `output_key: "messages"` returns only `messages` key (no double-write)
  - [ ] Use `MockLLM` or mock `llm.ainvoke` to return a predictable response

### Verify

- [ ] Run `pnpm tsc --noEmit` in canvas package
- [ ] Run `pnpm test` in canvas package
- [ ] Run `uv run pytest` in execution package
