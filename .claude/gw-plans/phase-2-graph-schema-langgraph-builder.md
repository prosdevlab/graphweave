# Execution Layer — Phase 2: GraphSchema → LangGraph Builder

## Context

The execution layer has auth (Phase 1.5), a DB layer, tools, and `state_utils` (Phase 1). The builder stub in `app/builder.py` raises `NotImplementedError`. This phase implements the core translation: a GraphSchema dict goes in, a compiled LangGraph `StateGraph` comes out, ready for `invoke()` and `stream()` in Phase 3.

**Principle**: "What you draw is what runs." Every canvas node becomes exactly one LangGraph node (or START/END constant). Every canvas edge becomes exactly one LangGraph edge. No invented abstractions.

---

## Architecture

### Build Pipeline

```
GraphSchema (dict)
       │
       ▼
 ┌─────────────────┐
 │  validate_schema │  Structural checks: 1 start, ≥1 end,
 │                  │  valid edges, tool names exist, output_keys
 │                  │  in state, condition branches valid
 └────────┬────────┘
          │ raises GraphBuildError(node_ref=...) on failure
          ▼
 ┌─────────────────┐
 │ build_state_type │  StateField[] → plain class with
 │                  │  Annotated __annotations__
 └────────┬────────┘
          │ returns type (not TypedDict — LangGraph only needs __annotations__)
          ▼
 ┌─────────────────┐
 │ StateGraph(Type) │  Create empty graph
 └────────┬────────┘
          │
          ▼
 ┌─────────────────┐
 │  add_nodes       │  For each non-start/end node:
 │                  │    llm    → _make_llm_node(config, llm)
 │                  │    tool   → _make_tool_node(config)
 │                  │    cond   → _make_passthrough_node()
 │                  │    human  → _make_human_node(config)
 └────────┬────────┘
          │
          ▼
 ┌─────────────────┐
 │  wire_edges      │  For each edge:
 │                  │    start→X  → add_edge(START, X)
 │                  │    X→end    → add_edge(X, END)
 │                  │    cond→*   → add_conditional_edges(cond, router_fn, branch_map)
 │                  │    X→Y      → add_edge(X, Y)
 └────────┬────────┘
          │
          ▼
 ┌─────────────────┐
 │  graph.compile() │  Returns BuildResult(graph, defaults)
 └─────────────────┘
```

### State Schema Generation

```
StateField[]                          TypedDict
─────────────                         ─────────
key="messages"                        messages: Annotated[list, add_messages]
  type="list", reducer="append"

key="result"                          result: str
  type="string", reducer="replace"

key="data"                            data: Annotated[dict, _merge_reducer]
  type="object", reducer="merge"

key="counter"                         counter: int
  type="number", reducer="replace"

key="items"                           items: Annotated[list, operator.add]
  type="list", reducer="append"
  (key != "messages")
```

**Decision**: The `messages` key with `append` reducer gets `add_messages` (LangGraph's message-aware deduplication reducer). All other `append` fields get `operator.add` (plain list concatenation). This is the only special-case — it exists because LangGraph itself treats messages specially.

### Canvas → LangGraph Translation Examples

**Example 1: Linear graph**

```
Canvas (what you draw)              LangGraph (what runs)
──────────────────────              ─────────────────────

  ┌───────┐                           START
  │ Start │                             │
  └───┬───┘                             ▼
      │                           ┌───────────┐
  ┌───┴───┐                       │  ask_llm   │  async: input_map → ainvoke → output_key
  │  LLM  │                       └─────┬─────┘
  └───┬───┘                             │
      │                                 ▼
  ┌───┴───┐                           END
  │  End  │
  └───────┘

  Start/End are canvas nodes       START/END are LangGraph constants
  with IDs and positions           (not real nodes)
```

**Example 2: Branching with condition**

```
Canvas                              LangGraph
──────                              ────────

  ┌───────┐                           START
  │ Start │                             │
  └───┬───┘                             ▼
      │                           ┌───────────┐
  ┌───┴────────┐                  │  search    │  tool: resolve → run → output_key
  │ Tool:search│                  └─────┬─────┘
  └───┬────────┘                        │
      │                                 ▼
  ┌───┴──────────┐                ┌───────────┐
  │ Cond:         │                │  check_err │  passthrough: return {}
  │ tool_error   │                └─────┬─────┘
  └──┬────────┬──┘                      │
     │        │                   add_conditional_edges(
  on_error  on_success              check_err,
     │        │                     router_fn,         ← checks state[search_result]["success"]
     ▼        ▼                     {"on_error": "retry", "on_success": END}
  ┌──────┐ ┌─────┐               )
  │Retry │ │ End │
  └──────┘ └─────┘
```

**Example 3: Loop with iteration limit**

```
Canvas                              LangGraph
──────                              ────────

  ┌───────┐                           START
  │ Start │                             │
  └───┬───┘                             ▼
      │                     ┌──── ┌───────────┐
      ▼                     │     │  refine    │  async: llm.ainvoke
  ┌──────────┐              │     └─────┬─────┘
  │ LLM:     │              │           │
  │ refine   │◄─── loop     │           ▼
  └────┬─────┘     back     │     ┌───────────┐
       │                    │     │  check_ct  │  passthrough
       ▼                    │     └─────┬─────┘
  ┌──────────────┐          │           │
  │ Cond:        │          │     add_conditional_edges(
  │ iteration_   │          │       check_ct,
  │ limit(3)     │          │       router_fn,         ← checks state[count] >= 3
  └──┬────────┬──┘          │       {"continue": "refine", "exceeded": END}
     │        │             │     )
  continue  exceeded        │           │
     │        │             │      continue → loops back to refine
     │        ▼             │      exceeded → END
     │     ┌─────┐          │
     └─────│     │──────────┘
           │ End │
           └─────┘
```

### Module Dependency Graph

```
┌─────────────────────────────────────────────────────────┐
│                    app/builder.py                         │
│  ┌────────────┐  ┌────────────┐  ┌────────────────────┐ │
│  │ validate_  │  │ build_     │  │ _make_llm_node     │ │
│  │ schema()   │  │ state_type │  │ _make_tool_node    │ │
│  │            │  │ ()         │  │ _make_human_node   │ │
│  │            │  │            │  │ _make_passthrough   │ │
│  │            │  │            │  │ _make_router        │ │
│  └─────┬──────┘  └────────────┘  └──────┬─────────────┘ │
│        │                                │                │
│  build_graph()  ─────────────────────────                │
└────────┼────────────────────────────────┼────────────────┘
         │                                │
         │                     ┌──────────┴──────────┐
         │                     │                     │
    ┌────▼────┐          ┌─────▼──────┐       ┌──────▼───────┐
    │ app/    │          │ app/       │       │ app/tools/   │
    │ llm.py  │          │ state_     │       │ registry.py  │
    │         │          │ utils.py   │       │              │
    │ get_llm │          │            │       │ get_tool()   │
    │ ()      │          │ resolve_   │       │ REGISTRY     │
    │         │          │ input_map  │       │              │
    └─────────┘          │ ()         │       └──────────────┘
         │               └────────────┘
         │
    ┌────▼────────────────────────────┐
    │    LangChain Provider SDKs      │
    │  ┌──────────┐ ┌──────────────┐  │
    │  │ OpenAI   │ │ Google GenAI │  │
    │  └──────────┘ └──────────────┘  │
    │  ┌──────────────┐               │
    │  │ Anthropic    │               │
    │  └──────────────┘               │
    └─────────────────────────────────┘
```

### Node → LangGraph Mapping

```
Node Type       LangGraph Primitive         Closure behavior
─────────       ───────────────────         ────────────────
start           START constant              (not a node)
end             END constant                (not a node)
llm             async node function         resolve_input_map → build messages → llm.ainvoke → {output_key: response}
tool            sync node function          resolve_input_map → tool.run → {output_key: result_envelope}
condition       passthrough + cond. edges   lambda: {} — routing via add_conditional_edges
human_input     node with interrupt()       calls interrupt({prompt, input_key}) → {input_key: value}
```

### Node ↔ State Interaction

```
                          GraphState (TypedDict)
                    ┌────────────────────────────────┐
                    │ messages: [HumanMessage(...)]   │
                    │ result: ""                      │
                    │ search_data: {}                 │
                    │ counter: 0                      │
                    └───────┬───────────┬────────────┘
                            │           │
              ┌─────────────┘           └────────────────┐
              │ input_map reads                          │ input_map reads
              ▼                                          ▼
     ┌────────────────────┐                   ┌────────────────────┐
     │   LLM Node         │                   │   Tool Node        │
     │                    │                   │                    │
     │ 1. resolve_input_  │                   │ 1. resolve_input_  │
     │    map(config[     │                   │    map(config[     │
     │    "input_map"],   │                   │    "input_map"],   │
     │    state)          │                   │    state)          │
     │                    │                   │                    │
     │ 2. Build messages: │                   │ 2. get_tool(name)  │
     │    [SystemMessage, │                   │    tool.run(inputs)│
     │     HumanMessage]  │                   │                    │
     │                    │                   │ 3. Return full     │
     │ 3. llm.ainvoke()   │                   │    envelope:       │
     │                    │                   │    {success: T/F,  │
     │ 4. Return:         │                   │     result: "...", │
     │    {output_key:    │                   │     recoverable:   │
     │     response.      │                   │     T/F}           │
     │     content}       │                   │                    │
     └────────┬───────────┘                   └─────────┬──────────┘
              │                                         │
              │ output_key writes                       │ output_key writes
              ▼                                         ▼
                    ┌────────────────────────────────┐
                    │ messages: [HumanMessage(...)]   │
                    │ result: "The answer is 42"  ◄───── LLM wrote here
                    │ search_data: {success: true, ◄──── Tool wrote here
                    │   result: "...", ...}           │
                    │ counter: 0                      │
                    └────────────────────────────────┘
```

### Condition Routing

Each condition type returns a branch name string. The condition node is a passthrough; routing happens via `add_conditional_edges`.

```
ConditionConfig type     Router logic                                      Returns
────────────────────     ────────────                                      ───────
field_equals             state[field] == value                             branch or default_branch
field_contains           value in str(state[field])                        branch or default_branch
field_exists             field in state and not None                       branch or default_branch
llm_router               llm.ainvoke(prompt + options) → parse choice     matched option or default_branch
tool_error               state[tool_output_key]["success"]                 on_success or on_error
iteration_limit          state[field] >= max                               exceeded or continue
```

---

## Engineering Review — Issues & Decisions

### Issue 1: `llm_provider` parameter on `build_graph` is redundant

Each LLM node already has `config.provider`. The top-level `llm_provider` parameter suggests a single provider for the whole graph, but GraphSchema allows different providers per node.

**Fix**: Replace with `llm_override: BaseChatModel | None = None`. When set, all LLM nodes and llm_router conditions use this model. Primary use: testing with `FakeListChatModel`.

### Issue 2: `tool_error` condition must find preceding tool's `output_key`

The `tool_error` config only has `on_error`/`on_success` — no state field reference. The builder must trace edges backward from the condition node to find the source tool node's `output_key`.

**Fix**: During validation, find incoming edges to the condition node, verify source is a tool node, store its `output_key`. Raise `GraphBuildError("tool_error condition must follow a tool node", node_ref=condition_id)` if not.

### Issue 3: `langchain-anthropic` missing from dependencies

GraphSchema supports `provider: "anthropic"` but the dep isn't in `pyproject.toml`.

**Fix**: Add `langchain-anthropic>=0.3.0`.

### Issue 4: Async vs sync node functions

LLM calls should be async (`ainvoke`). Tools are sync per `BaseTool` contract. LangGraph handles both.

**Fix**: LLM node closures → `async def` with `llm.ainvoke()`. Tool node closures → plain `def` with `tool.run()`. `llm_router` routing functions → `async def`. All others → plain `def`.

### Issue 5: Dynamic state schema creation

Python's `TypedDict` functional form doesn't support `Annotated` types. `types.new_class()` with `TypedDict` also fails because `TypedDict` uses special metaclass machinery that `new_class` bypasses. LangGraph's `_get_channels` only needs `hasattr(schema, "__annotations__")` and `get_type_hints(schema, include_extras=True)` to work — it does NOT check `is_typeddict()`.

**Fix**: Use plain `type()` with `__annotations__` and `__module__`:
```python
def build_state_type(state_fields):
    annotations = {f["key"]: _get_annotated_type(f) for f in state_fields}
    GraphState = type("GraphState", (), {"__annotations__": annotations})
    GraphState.__module__ = __name__  # Required for get_type_hints resolution
    return GraphState
```

This creates a plain class with annotations — LangGraph extracts channels from `get_type_hints(schema, include_extras=True)` which works on any class with `__annotations__`.

### Issue 6: `interrupt()` requires a checkpointer

LangGraph's `interrupt()` only works when the graph is compiled with a checkpointer. Graphs without human_input nodes don't need one.

**Fix**: `build_graph` detects human_input nodes. If present, compile with `InMemorySaver` checkpointer (not `MemorySaver` which is a deprecated alias): `graph.compile(checkpointer=InMemorySaver())`. Phase 3 replaces with a persistent checkpointer.

**Critical for Phase 3**: Graphs with checkpointers require `config={"configurable": {"thread_id": "..."}}` at invocation. Resume after interrupt requires `Command(resume=value)` from `langgraph.types` as the input — not a regular state dict. Document this contract now so Phase 3 doesn't miss it.

### Issue 6b: Must use `ainvoke`/`astream` in FastAPI

LangGraph graphs with async node functions (our LLM nodes) must NOT be called with sync `graph.invoke()` inside FastAPI — this would fail with "cannot run nested event loop." All invocation must use `await graph.ainvoke()` or `async for chunk in graph.astream()`.

**Fix**: Builder returns a `CompiledStateGraph` — it doesn't invoke. But document this constraint clearly for Phase 3. Add a comment in `build_graph` docstring: "Use `ainvoke()`/`astream()` — never sync `invoke()` in async contexts."

### Issue 7: `llm_router` routing model

The schema has `routing_model?: string` but no provider field. Need a default.

**Fix**: `llm_router` uses `llm_override` if provided. Otherwise: `get_llm("openai", routing_model or "gpt-4o-mini", temperature=0.0, max_tokens=100)` — cheap and fast for routing decisions.

### Issue 8: Start/End node edge translation

Start/End are canvas nodes with IDs, but map to LangGraph constants. Edge wiring must translate `source=start_id` → `START` and `target=end_id` → `END`.

**Fix**: Build a translation map during edge wiring. Start node ID → `START`, end node IDs → `END`, everything else → node ID directly.

---

## Part A: LLM Provider Factory — `app/llm.py`

New file. Separated from builder because Phase 3 executor and `llm_router` conditions also need it.

### A1. `get_llm` function

```python
from langchain_core.language_models import BaseChatModel

def get_llm(
    provider: str,
    model: str,
    temperature: float = 0.7,
    max_tokens: int = 1024,
) -> BaseChatModel:
```

Provider mapping:
- `"openai"` → `ChatOpenAI(model, temperature, max_tokens)`
- `"gemini"` → `ChatGoogleGenerativeAI(model, temperature, max_output_tokens=max_tokens)`
- `"anthropic"` → `ChatAnthropic(model, temperature, max_tokens)`
- Unknown → `ValueError(f"Unsupported LLM provider: {provider}")` (builder wraps as `GraphBuildError`)

Imports are at the top of the file (not lazy). `llm.py` raises `ValueError` for unknown providers (not `GraphBuildError`) to avoid circular imports with `builder.py`. The builder catches and wraps as needed. API keys come from env vars — no validation at build time. Missing keys fail clearly at invoke time via the provider SDK.

---

## Part B: Schema Validation — `app/builder.py`

### B1. `validate_schema(schema: dict) -> None`

Called first by `build_graph`. Raises `GraphBuildError` with `node_ref` on failure.

Checks (in order):

1. **Required keys**: `id`, `name`, `version`, `state`, `nodes`, `edges`
2. **Exactly one start node**
3. **At least one end node**
4. **Unique node IDs**
5. **Valid edges**: every `source` and `target` reference existing node IDs
6. **Start has no incoming edges**
7. **End nodes have no outgoing edges**
8. **Tool names exist**: `get_tool(config["tool_name"])` doesn't raise for each tool node
9. **Output keys in state**: each llm/tool node's `output_key` matches a `state[].key`
10. **Condition branches valid**: all target IDs in `config["branches"]` reference existing nodes
11. **Default branch valid**: `config["default_branch"]` must be a key in `config["branches"]` or a valid node ID
12. **tool_error source**: incoming edge's source must be a tool node
13. **Reachability**: BFS from start reaches all non-start/end nodes (warning log, not a block)

### B2. `_find_tool_output_key(schema, condition_node_id) -> str`

Traces edges backward from a `tool_error` condition to find the source tool node's `output_key`. Used during validation and router creation.

---

## Part C: State Type Generation — `app/builder.py`

### C1. `build_state_type(state_fields: list[dict]) -> type`

Type mapping:
```python
_TYPE_MAP = {
    "string": str,
    "number": int,
    "boolean": bool,
    "list": list,
    "object": dict,
}
```

Reducer mapping:
```python
def _get_annotated_type(field: dict) -> type:
    base = _TYPE_MAP[field["type"]]
    reducer = field["reducer"]
    if reducer == "replace":
        return base
    if reducer == "append":
        if field["key"] == "messages":
            return Annotated[list, add_messages]
        return Annotated[list, operator.add]
    if reducer == "merge":
        return Annotated[dict, _merge_reducer]
    raise GraphBuildError(f"Unknown reducer: {reducer}")
```

### C2. `_merge_reducer(left: dict, right: dict) -> dict`

Deep merge for `merge` reducer:
```python
def _merge_reducer(left: dict, right: dict) -> dict:
    result = {**left}
    for key, value in right.items():
        if key in result and isinstance(result[key], dict) and isinstance(value, dict):
            result[key] = _merge_reducer(result[key], value)
        else:
            result[key] = value
    return result
```

### C3. Dynamic state class via `type()`

```python
def build_state_type(state_fields: list[dict]) -> type:
    annotations = {f["key"]: _get_annotated_type(f) for f in state_fields}
    GraphState = type("GraphState", (), {"__annotations__": annotations})
    GraphState.__module__ = __name__  # Required for get_type_hints resolution
    return GraphState
```

LangGraph only needs `get_type_hints(schema, include_extras=True)` to work — it doesn't check `is_typeddict()`. A plain class with `__annotations__` and `__module__` set satisfies this.

### C4. State field defaults

`StateField.default` values need to be applied as initial state when the graph is invoked. LangGraph channels without input raise `EmptyChannelError` at runtime.

**Approach**: `build_graph` returns both the compiled graph AND a defaults dict. The caller (Phase 3 executor) merges defaults with user-provided input before invocation.

```python
def _build_defaults(state_fields: list[dict]) -> dict:
    defaults = {}
    for field in state_fields:
        if "default" in field and field["default"] is not None:
            defaults[field["key"]] = field["default"]
        elif field["type"] == "list":
            defaults[field["key"]] = []
        elif field["type"] == "object":
            defaults[field["key"]] = {}
        elif field["type"] == "string":
            defaults[field["key"]] = ""
        elif field["type"] == "number":
            defaults[field["key"]] = 0
        elif field["type"] == "boolean":
            defaults[field["key"]] = False
    return defaults
```

`build_graph` returns a `BuildResult` named tuple:
```python
class BuildResult(NamedTuple):
    graph: CompiledStateGraph
    defaults: dict
```

---

## Part D: Node Function Factories — `app/builder.py`

### D1. `_make_llm_node(node_id, config, llm) -> Callable`

Returns an async closure:

```python
async def llm_node(state: dict) -> dict:
    inputs = resolve_input_map(config["input_map"], state)
    messages = []
    if config.get("system_prompt"):
        messages.append(SystemMessage(content=config["system_prompt"]))
    user_content = _format_inputs(inputs)
    messages.append(HumanMessage(content=user_content))
    response = await llm.ainvoke(messages)
    return {config["output_key"]: response.content}
```

`_format_inputs(inputs: dict) -> str`: Single key → its string value. Multiple keys → `"key1: value1\nkey2: value2"`.

### D2. `_make_tool_node(node_id, config) -> Callable`

Returns a sync closure:

```python
def tool_node(state: dict) -> dict:
    tool = get_tool(config["tool_name"])
    inputs = resolve_input_map(config["input_map"], state)
    result = tool.run(inputs)
    return {config["output_key"]: result}
```

Result is the full tool envelope `{success, result/error, recoverable}` — important for `tool_error` condition routing.

### D3. `_make_passthrough_node() -> Callable`

```python
def passthrough(state: dict) -> dict:
    return {}
```

### D4. `_make_human_node(node_id, config) -> Callable`

```python
from langgraph.types import interrupt

def human_node(state: dict) -> dict:
    value = interrupt({
        "prompt": config["prompt"],
        "input_key": config["input_key"],
        "node_id": node_id,
    })
    return {config["input_key"]: value}
```

### D5. `_create_node_function(node, schema, llm_override)` — dispatcher

```python
match node["type"]:
    case "llm":
        llm = llm_override or get_llm(
            node["config"]["provider"],
            node["config"]["model"],
            node["config"].get("temperature", 0.7),
            node["config"].get("max_tokens", 1024),
        )
        return _make_llm_node(node["id"], node["config"], llm)
    case "tool":
        return _make_tool_node(node["id"], node["config"])
    case "condition":
        return _make_passthrough_node()
    case "human_input":
        return _make_human_node(node["id"], node["config"])
```

---

## Part E: Condition Routing Functions — `app/builder.py`

### E1. `_make_router(node_id, config, schema, llm_override) -> Callable`

Dispatcher based on `config["condition"]["type"]`.

**Important**: Set `router.__name__ = f"route_{node_id}"` on each returned function. LangGraph uses the routing function's `__name__` internally — anonymous closures cause name collisions when multiple condition nodes exist.

### E2. Individual routers

**`_router_field_equals(condition, default)`**:
```python
def router(state):
    if state.get(condition["field"]) == condition["value"]:
        return condition["branch"]
    return default
```

**`_router_field_contains(condition, default)`**:
```python
def router(state):
    field_val = state.get(condition["field"], "")
    if condition["value"] in str(field_val):
        return condition["branch"]
    return default
```

**`_router_field_exists(condition, default)`**:
```python
def router(state):
    if condition["field"] in state and state[condition["field"]] is not None:
        return condition["branch"]
    return default
```

**`_router_llm(condition, default, llm_override)`** — async:
```python
async def router(state):
    options = condition["options"]
    prompt = f"{condition['prompt']}\n\nRespond with exactly one of: {', '.join(options)}"
    routing_llm = llm_override or get_llm(
        "openai", condition.get("routing_model", "gpt-4o-mini"), 0.0, 100,
    )
    response = await routing_llm.ainvoke([HumanMessage(content=prompt)])
    choice = response.content.strip().lower()
    # Fuzzy match: check substring containment, not just exact equality
    # LLMs often return "I would choose branch_a" instead of just "branch_a"
    for opt in options:
        if opt.lower() in choice:
            return opt
    return default
```

**`_router_tool_error(condition, tool_output_key)`**:
```python
def router(state):
    tool_output = state.get(tool_output_key, {})
    if isinstance(tool_output, dict) and tool_output.get("success"):
        return condition["on_success"]
    return condition["on_error"]
```

Where `tool_output_key` is resolved at build time via `_find_tool_output_key`.

**`_router_iteration_limit(condition)`**:
```python
def router(state):
    count = state.get(condition["field"], 0)
    if count >= condition["max"]:
        return condition["exceeded"]
    return condition["continue"]
```

---

## Part F: Graph Compilation — `app/builder.py`

### F1. Updated `build_graph` signature

```python
class BuildResult(NamedTuple):
    graph: CompiledStateGraph
    defaults: dict  # State field defaults for invocation

def build_graph(
    schema: dict,
    *,
    llm_override: BaseChatModel | None = None,
) -> BuildResult:
    """Build a LangGraph StateGraph from a GraphSchema dict.

    Returns a BuildResult with the compiled graph and state defaults.
    Use ainvoke()/astream() — never sync invoke() in async contexts (FastAPI).
    Graphs with human_input nodes require config={"configurable": {"thread_id": "..."}}.
    Resume after interrupt requires Command(resume=value) as input.
    """
```

### F2. Implementation flow

```python
def build_graph(schema, *, llm_override=None):
    # 1. Validate
    validate_schema(schema)

    # 2. Build state type + defaults
    state_type = build_state_type(schema["state"])
    defaults = _build_defaults(schema["state"])

    # 3. Create graph
    graph = StateGraph(state_type)

    # 4. Index nodes
    nodes_by_id = {n["id"]: n for n in schema["nodes"]}
    start_id = next(n["id"] for n in schema["nodes"] if n["type"] == "start")
    end_ids = {n["id"] for n in schema["nodes"] if n["type"] == "end"}

    # 5. Add nodes (skip start/end — they map to START/END constants, NOT real nodes)
    for node in schema["nodes"]:
        if node["type"] in ("start", "end"):
            continue
        node_fn = _create_node_function(node, schema, llm_override)
        graph.add_node(node["id"], node_fn)

    # 6. Wire edges — translate start/end IDs to START/END constants
    #    START = "__start__" and END = "__end__" in LangGraph
    condition_ids = {n["id"] for n in schema["nodes"] if n["type"] == "condition"}
    cond_edges: dict[str, dict[str, str]] = {}  # {cond_id: {branch: target}}

    for edge in schema["edges"]:
        source = START if edge["source"] == start_id else edge["source"]
        target = END if edge["target"] in end_ids else edge["target"]

        if edge["source"] in condition_ids:
            branch = edge.get("condition_branch") or edge.get("label", "default")
            cond_edges.setdefault(edge["source"], {})[branch] = target
        else:
            graph.add_edge(source, target)

    # 7. Wire conditional edges
    for cond_id, branch_map in cond_edges.items():
        cond_node = nodes_by_id[cond_id]
        router_fn = _make_router(cond_id, cond_node["config"], schema, llm_override)
        graph.add_conditional_edges(cond_id, router_fn, branch_map)

    # 8. Compile — add checkpointer if human_input nodes exist
    has_human_input = any(n["type"] == "human_input" for n in schema["nodes"])
    try:
        if has_human_input:
            from langgraph.checkpoint.memory import InMemorySaver
            compiled = graph.compile(checkpointer=InMemorySaver())
        else:
            compiled = graph.compile()
        return BuildResult(graph=compiled, defaults=defaults)
    except Exception as exc:
        raise GraphBuildError(f"Graph compilation failed: {exc}") from exc
```

---

## Part G: Dependency Update

### G1. Add `langchain-anthropic` to `pyproject.toml`

Add `"langchain-anthropic>=0.3.0"` to the `dependencies` list.

### G2. Run `uv lock`

Regenerate `uv.lock` with the new dependency.

---

## Part H: Tests

### Test Coverage Analysis

```
Core Flow                          Unit Tests        Integration Tests    Gap?
─────────                          ──────────        ─────────────────    ────
Schema validation (reject bad)     8 validation      —                    ✓ covered
State type generation              4 state type      —                    ✓ covered
LLM node (input→LLM→output)       3 LLM node        test_linear_graph    ✓ covered
Tool node (input→tool→output)      3 tool node       test_linear_graph    ✓ covered
Condition routing (6 types)        7 routing          test_branching       ✓ covered
Human input (interrupt/resume)     1 interrupt        —                    ⚠ see gap 1
Edge wiring (start/end→constants)  —                  all integration      ⚠ see gap 2
BuildResult (graph + defaults)     —                  —                    ⚠ see gap 3
LLM provider factory               3 LLM factory     —                    ✓ covered
Error propagation (node_ref)       2 with node_ref   —                    ⚠ see gap 4
Multiple end nodes                 —                  —                    ⚠ see gap 5
```

### Gaps Identified & Tests Added

**Gap 1**: Human input test only checks interrupt — doesn't verify resume.
**Gap 2**: No dedicated test for start/end → START/END constant translation.
**Gap 3**: `BuildResult.defaults` never tested — state defaults could silently break.
**Gap 4**: Only 2 tests check `node_ref` on `GraphBuildError` — should verify all validation errors include it.
**Gap 5**: No test for multiple end nodes (schema allows ≥1).
**Gap 6**: `_format_inputs` not tested (single key vs multi-key formatting).
**Gap 7**: `llm_router` condition not tested in integration (only sync routers tested).
**Gap 8**: `_merge_reducer` edge cases (empty dicts, non-dict values overwriting dicts).

---

### `tests/unit/test_llm.py` (4 tests)

- `test_get_llm_openai` — returns `ChatOpenAI` instance
- `test_get_llm_gemini` — returns `ChatGoogleGenerativeAI` instance
- `test_get_llm_anthropic` — returns `ChatAnthropic` instance ← **added (new dep!)**
- `test_get_llm_unknown_raises` — raises `ValueError`

Note: Instantiation only, no `invoke` (no API key needed).

### `tests/unit/test_builder.py` (~38 tests)

Uses `FakeListChatModel` for deterministic LLM responses. No real API calls.

**Test fixture**: `make_schema(**overrides)` — minimal valid schema (start → end) with `messages` + `result` state fields. Helper functions for adding nodes/edges to the base schema.

**Validation tests (10)** — every error includes `node_ref` where applicable:
- `test_valid_minimal_schema` — start → end compiles, returns `BuildResult`
- `test_missing_start_node` → `GraphBuildError`
- `test_multiple_start_nodes` → `GraphBuildError`
- `test_no_end_node` → `GraphBuildError`
- `test_duplicate_node_ids` → `GraphBuildError`
- `test_edge_references_nonexistent_node` → `GraphBuildError`
- `test_tool_node_unknown_tool` → `GraphBuildError` with `node_ref == tool_node_id`
- `test_output_key_not_in_state` → `GraphBuildError` with `node_ref == node_id`
- `test_tool_error_without_tool_predecessor` → `GraphBuildError` with `node_ref` ← **added**
- `test_default_branch_not_in_branches` → `GraphBuildError` ← **added**

**State type tests (4)**:
- `test_replace_reducer` — plain type, no Annotated
- `test_append_messages_reducer` — `Annotated[list, add_messages]`
- `test_append_non_messages_reducer` — `Annotated[list, operator.add]`
- `test_merge_reducer` — deep merge: `{"a": {"b": 1}}` + `{"a": {"c": 2}}` = `{"a": {"b": 1, "c": 2}}`

**State defaults tests (3)** ← **new section**:
- `test_defaults_from_schema` — `_build_defaults` returns correct defaults for each type
- `test_defaults_with_explicit_values` — `StateField.default` overrides type defaults
- `test_build_result_includes_defaults` — `build_graph` returns `BuildResult` with populated defaults

**LLM node tests (4)**:
- `test_llm_node_basic` — start → llm → end, verify `state["result"]` matches FakeListChatModel response
- `test_llm_node_with_system_prompt` — verify system prompt in messages passed to LLM
- `test_llm_node_input_map` — input_map resolves expressions before LLM call
- `test_llm_node_format_inputs_multi_key` — multiple input_map keys formatted as `"key: value\n..."` ← **added**

**Tool node tests (3)**:
- `test_tool_node_calculator` — calculator tool produces correct result
- `test_tool_node_output_envelope` — result includes `{success, result, recoverable}`
- `test_tool_node_unknown_tool_validation` — caught at validation time

**Condition routing tests (8)** — each tests the full graph flow (build + invoke):
- `test_field_equals_match` / `test_field_equals_no_match` — routes to branch or default
- `test_field_contains` — substring match routing
- `test_field_exists` / `test_field_not_exists` — presence check routing ← **split into 2**
- `test_tool_error_success_path` / `test_tool_error_failure_path` — tool result routing
- `test_iteration_limit` — count threshold routing

**Human input tests (2)** ← **expanded**:
- `test_human_input_interrupts` — graph pauses at human_input node, interrupt payload contains prompt + input_key + node_id
- `test_human_input_graph_has_checkpointer` — `BuildResult.graph` compiled with `InMemorySaver` when human_input present

**Full graph integration tests (5)** ← **expanded**:
- `test_linear_graph` — start → llm → tool → end compiles and invokes successfully
- `test_branching_graph` — start → condition(field_equals) → (branch_a | branch_b) → end
- `test_loop_with_iteration_limit` — start → tool → condition(iteration_limit) → (loop | end), verify loop executes expected count
- `test_multiple_end_nodes` — graph with 2 end nodes, condition routes to either ← **added**
- `test_defaults_applied_at_invocation` — invoke with `BuildResult.defaults` merged, verify all state fields initialized ← **added**

### Regression Prevention Matrix

```
What could break?                    Which test catches it?
──────────────────                   ─────────────────────
State schema rejected by LangGraph   test_valid_minimal_schema (build + invoke)
add_messages vs operator.add mix-up  test_append_messages_reducer + test_linear_graph
Start/End not mapped to constants    test_linear_graph (would fail to compile)
Condition routes to wrong branch     test_field_equals_match/no_match (both paths)
tool_error reads wrong state key     test_tool_error_success/failure (full flow)
Loop runs forever (no exit)          test_loop_with_iteration_limit (asserts count)
LLM node drops system prompt         test_llm_node_with_system_prompt
Tool envelope missing success field  test_tool_node_output_envelope
Human input doesn't pause            test_human_input_interrupts
Defaults not provided → crash        test_defaults_applied_at_invocation
Router name collision                test_branching_graph (multiple conditions)
New LangGraph version breaks API     All integration tests (build + invoke)
```

---

## Files Summary

| Action | File |
|--------|------|
| **create** | `app/llm.py` — LLM provider factory |
| **create** | `tests/unit/test_llm.py` — 3 provider tests |
| **create** | `tests/unit/test_builder.py` — ~28 builder tests |
| **modify** | `app/builder.py` — full implementation |
| **modify** | `pyproject.toml` — add `langchain-anthropic` |
| **regen** | `uv.lock` — via `uv lock` |

---

## Verification

```bash
cd packages/execution
uv sync                                    # picks up langchain-anthropic
uv run ruff check app/ tests/             # lint passes
uv run ruff format --check app/ tests/    # format passes
uv run pytest tests/unit/ -v              # all tests pass (existing + ~31 new)
```

Manual smoke test:
```python
from langchain_core.language_models import FakeListChatModel
from app.builder import build_graph

schema = {
    "id": "smoke", "name": "Smoke", "version": 1,
    "state": [
        {"key": "messages", "type": "list", "reducer": "append"},
        {"key": "result", "type": "string", "reducer": "replace"},
    ],
    "nodes": [
        {"id": "s", "type": "start", "label": "Start", "position": {"x":0,"y":0}, "config": {}},
        {"id": "llm_1", "type": "llm", "label": "LLM", "position": {"x":0,"y":100}, "config": {
            "provider": "openai", "model": "gpt-4o",
            "system_prompt": "You are helpful.",
            "temperature": 0.7, "max_tokens": 100,
            "input_map": {"question": "messages[-1].content"},
            "output_key": "result",
        }},
        {"id": "e", "type": "end", "label": "End", "position": {"x":0,"y":200}, "config": {}},
    ],
    "edges": [
        {"id": "e1", "source": "s", "target": "llm_1"},
        {"id": "e2", "source": "llm_1", "target": "e"},
    ],
    "metadata": {"created_at": "2026-01-01", "updated_at": "2026-01-01"},
}

mock = FakeListChatModel(responses=["42"])
build_result = build_graph(schema, llm_override=mock)
# Use ainvoke in async context (FastAPI). For smoke test, invoke is OK.
result = build_result.graph.invoke({**build_result.defaults, "messages": [("human", "meaning of life?")]})
assert result["result"] == "42"
```

---

## Not in Scope (with Phase 3 contracts)

- **Graph invocation** (Phase 3) — must use `ainvoke()`/`astream()`, never sync `invoke()` in FastAPI
- **SSE streaming** (Phase 3) — `astream()` yields node events
- **Run DB persistence** (Phase 3) — executor stores run state in DB
- **Human input resume** (Phase 3) — must use `Command(resume=value)` from `langgraph.types` as input, not regular state dict. Requires `config={"configurable": {"thread_id": run_id}}`
- **Persistent checkpointer** (Phase 3) — replace `InMemorySaver` with SQLite-backed checkpointer for production
- **State defaults merging** (Phase 3) — executor merges `BuildResult.defaults` with user input before invocation
- **Max-step limit** (Phase 3) — executor enforces max node executions per run (defense against unconditional cycles)
- **LLM retry / circuit-breaker** (Phase 3)
- **LLM structured output / JSON mode** (future) — `output_key` pattern works, value format changes
- **Cycle detection** — best-effort BFS reachability only; max-step limit is the runtime safety net
- **`llm_router` multi-provider routing** — always defaults to OpenAI; schema evolution task

---

## Decisions & Risks

### Assumptions we made (no clarifying questions asked)

| Assumption | What we chose | Risk if wrong | Mitigation |
|------------|---------------|---------------|------------|
| `messages` key is always the LangGraph message channel | Special-cased `messages` + `append` → `add_messages` reducer; all other `append` fields get `operator.add` | If user names their message channel differently (e.g. `chat_history`), it won't get `add_messages` semantics | **Check**: match on `key == "messages"` only. This matches the schema's `readonly: true` default field. If we later need flexibility, add a `is_message_channel: bool` flag to `StateField` — schema change, not builder change |
| LLM node input becomes a single `HumanMessage` | `_format_inputs` joins all input_map values into one string | User might expect structured multi-message input or image inputs | **Scope guard**: Phase 2 handles text-only. `_format_inputs` is a single function — easy to swap for structured input in a future phase without touching the rest of the builder |
| `llm_router` always uses OpenAI for routing | No provider field in the schema's `ConditionConfig` for `llm_router` | User wants to route with Anthropic or Gemini | **Fallback chain**: `llm_override` (test) → OpenAI `gpt-4o-mini` (production). If this becomes a real need, it's a schema evolution (add `routing_provider` to `ConditionConfig`), not a builder redesign |
| Tool nodes are sync, no `asyncio.to_thread` | Builder creates sync closures; tools run on the event loop thread | Could block the event loop for slow tools (`url_fetch` with 10s timeout) | **Accepted for Phase 2**. Phase 3 executor wraps `tool.run()` in `asyncio.to_thread()` — the closure itself stays sync, the executor handles async wrapping. Builder doesn't need to change. |
| `MemorySaver` (in-memory) is sufficient for human_input | Builder auto-adds `MemorySaver` when `human_input` nodes are present | In-memory state is lost on server restart — interrupted graphs can't resume | **Phase 3 fix**: Executor replaces `MemorySaver` with a persistent checkpointer (SQLite-backed). Builder's compile step is a single line to change. For Phase 2 tests, `MemorySaver` is correct. |
| Condition `default_branch` always exists in the branch map | Router returns `default_branch` on no-match, expects it to be a valid edge target | If `default_branch` points to a node not in `branches`, `add_conditional_edges` will fail | **Validation check B1.10** already validates all branch targets reference existing nodes. Add explicit check: `default_branch` must be a key in `branches` or a valid node ID. Raise `GraphBuildError` if not. |
| Graph validation is best-effort (no full cycle analysis) | BFS reachability from start; no topological cycle detection | An unconditional cycle slips through and runs forever | **Defense in depth**: Phase 3 executor adds a max-step limit (e.g. 100 node executions per run). If exceeded, run terminates with `graph_error` event. Builder logs a warning for unreachable nodes but doesn't block. |
| Single `output_key` per node (string, not structured) | LLM nodes write `response.content` (string), tool nodes write full envelope (dict) | User expects LLM to write structured output (JSON parsing) | **Accepted**. LLM structured output (JSON mode, function calling) is a Phase 3+ feature. The `output_key` pattern works for both — it's the value that changes, not the wiring. |

### Technical risks (reviewed by LangGraph specialist)

| Risk | Severity | Mitigation |
|------|----------|------------|
| `TypedDict` dynamic creation fails with `new_class()` | **BLOCKER → Fixed** | Use plain `type()` with `__annotations__` + `__module__`. LangGraph only needs `get_type_hints(schema, include_extras=True)` — does NOT check `is_typeddict()`. |
| Sync `invoke()` fails inside FastAPI async context | **BLOCKER → Documented** | Builder returns compiled graph, doesn't invoke. Docstring documents: "Use `ainvoke()`/`astream()` only." Phase 3 enforces this. |
| `MemorySaver` is a deprecated alias | Medium → Fixed | Use `InMemorySaver` from `langgraph.checkpoint.memory`. |
| Resume after `interrupt()` requires `Command(resume=value)` | **Critical for Phase 3** | Documented in `build_graph` docstring and Not in Scope. Phase 3 must use `Command(resume=user_input)` not regular state dict. |
| Router function name collisions | Medium → Fixed | Set `router.__name__ = f"route_{node_id}"` on each routing function. |
| LLM router returns extra text ("I choose branch_a") | Medium → Fixed | Use substring matching (`opt.lower() in choice`) not exact equality. |
| State fields without defaults raise `EmptyChannelError` | Medium → Fixed | `_build_defaults()` provides safe defaults for all field types. `BuildResult` returns defaults alongside compiled graph. |
| `FakeListChatModel` responses consumed in order | Low | Each test creates a fresh instance with specific response list. |
| `tool_error` can't find source tool | Low | Validation traces edges backward, raises `GraphBuildError(node_ref=condition_id)`. |
| LLM API key missing at runtime | Low | Fails at `ainvoke()`, not build — provider SDKs give clear errors. |
| `llm_router` prompt injection via state | Low | LLM output substring-matched against `options` list only. No match → `default_branch`. Can't route to arbitrary nodes. |
| `_merge_reducer` infinite recursion | Low | Only recurses on nested dicts; non-dict values terminate. State depth bounded by schema. |
| Circular import: `app/llm.py` ↔ `app/builder.py` | Low | `llm.py` raises `ValueError`, never imports from builder. |
| LangGraph API changes | Low | Pin `langgraph>=0.2.0,<1.0`. Tests exercise core APIs — breaking changes caught in CI. |
| Sync tool node blocks event loop | **Not an issue** | LangGraph auto-wraps sync node functions in thread executor. Keeping tools sync is correct. |
