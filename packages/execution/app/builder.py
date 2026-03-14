"""GraphSchema to LangGraph StateGraph builder."""

from __future__ import annotations

import logging
import operator
from collections import deque
from typing import Annotated, NamedTuple

from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages
from langgraph.graph.state import CompiledStateGraph
from langgraph.types import interrupt

from app.llm import get_llm
from app.state_utils import resolve_input_map
from app.tools.registry import get_tool

logger = logging.getLogger(__name__)


class GraphBuildError(Exception):
    """Raised when a graph cannot be compiled from the schema."""

    def __init__(self, message: str, node_ref: str | None = None):
        super().__init__(message)
        self.node_ref = node_ref


class BuildResult(NamedTuple):
    """Result of build_graph: compiled graph + state field defaults."""

    graph: CompiledStateGraph
    defaults: dict


# ---------------------------------------------------------------------------
# State type generation
# ---------------------------------------------------------------------------

_TYPE_MAP: dict[str, type] = {
    "string": str,
    "number": float,
    "boolean": bool,
    "list": list,
    "object": dict,
}


def _merge_reducer(left: dict, right: dict) -> dict:
    """Deep-merge two dicts (used as reducer for 'merge' state fields)."""
    result = {**left}
    for key, value in right.items():
        if key in result and isinstance(result[key], dict) and isinstance(value, dict):
            result[key] = _merge_reducer(result[key], value)
        else:
            result[key] = value
    return result


def _get_annotated_type(field: dict) -> type:
    """Return the (possibly Annotated) type for a state field."""
    base = _TYPE_MAP.get(field["type"])
    if base is None:
        raise GraphBuildError(
            f"Unknown state field type: {field['type']}",
            node_ref=field.get("key"),
        )

    reducer = field["reducer"]
    if reducer == "replace":
        return base
    if reducer == "append":
        if field["key"] == "messages":
            return Annotated[list, add_messages]
        return Annotated[list, operator.add]
    if reducer == "merge":
        return Annotated[dict, _merge_reducer]

    raise GraphBuildError(
        f"Unknown reducer: {reducer}",
        node_ref=field.get("key"),
    )


def build_state_type(state_fields: list[dict]) -> type:
    """Build a dynamic state class from StateField dicts.

    Returns a plain class with ``__annotations__`` — LangGraph only needs
    ``get_type_hints(schema, include_extras=True)`` to extract channels.
    """
    annotations = {f["key"]: _get_annotated_type(f) for f in state_fields}
    graph_state = type("GraphState", (), {"__annotations__": annotations})
    graph_state.__module__ = __name__  # Required for get_type_hints resolution
    return graph_state


def _build_defaults(state_fields: list[dict]) -> dict:
    """Return safe default values for all state fields."""
    _default_for_type = {
        "string": "",
        "number": 0,
        "boolean": False,
        "list": [],
        "object": {},
    }
    defaults: dict = {}
    for field in state_fields:
        if "default" in field and field["default"] is not None:
            defaults[field["key"]] = field["default"]
        else:
            # Use a fresh copy for mutable defaults
            default = _default_for_type.get(field["type"])
            if isinstance(default, (list, dict)):
                defaults[field["key"]] = type(default)()
            else:
                defaults[field["key"]] = default
    return defaults


# ---------------------------------------------------------------------------
# Schema validation
# ---------------------------------------------------------------------------


def _find_tool_output_key(schema: dict, condition_node_id: str) -> str:
    """Trace edges backward from a tool_error condition to its source tool.

    Returns the tool node's output_key.

    Raises:
        GraphBuildError: If the source is not a tool node.
    """
    nodes_by_id = {n["id"]: n for n in schema["nodes"]}
    for edge in schema["edges"]:
        if edge["target"] == condition_node_id:
            source_node = nodes_by_id.get(edge["source"])
            if source_node and source_node["type"] == "tool":
                return source_node["config"]["output_key"]

    raise GraphBuildError(
        "tool_error condition must follow a tool node",
        node_ref=condition_node_id,
    )


def validate_schema(schema: dict) -> None:
    """Validate a GraphSchema dict. Raises GraphBuildError on failure."""
    # 1. Required top-level keys
    for key in ("id", "name", "version", "state", "nodes", "edges"):
        if key not in schema:
            raise GraphBuildError(f"Missing required key: {key}")

    nodes = schema["nodes"]
    edges = schema["edges"]
    node_ids = {n["id"] for n in nodes}

    # 2. Exactly one start node
    start_nodes = [n for n in nodes if n["type"] == "start"]
    if len(start_nodes) == 0:
        raise GraphBuildError("Schema must have exactly one start node")
    if len(start_nodes) > 1:
        raise GraphBuildError(
            "Schema must have exactly one start node",
            node_ref=start_nodes[1]["id"],
        )
    start_id = start_nodes[0]["id"]

    # 3. At least one end node
    end_nodes = [n for n in nodes if n["type"] == "end"]
    if len(end_nodes) == 0:
        raise GraphBuildError("Schema must have at least one end node")

    # 4. Unique node IDs
    seen_ids: set[str] = set()
    for node in nodes:
        if node["id"] in seen_ids:
            raise GraphBuildError(
                f"Duplicate node ID: {node['id']}", node_ref=node["id"]
            )
        seen_ids.add(node["id"])

    # 5. Valid edges — source and target reference existing nodes
    for edge in edges:
        if edge["source"] not in node_ids:
            raise GraphBuildError(
                f"Edge references nonexistent source: {edge['source']}",
                node_ref=edge["source"],
            )
        if edge["target"] not in node_ids:
            raise GraphBuildError(
                f"Edge references nonexistent target: {edge['target']}",
                node_ref=edge["target"],
            )

    # 6. Start has no incoming edges
    for edge in edges:
        if edge["target"] == start_id:
            raise GraphBuildError(
                "Start node must not have incoming edges", node_ref=start_id
            )

    # 7. End nodes have no outgoing edges
    end_ids = {n["id"] for n in end_nodes}
    for edge in edges:
        if edge["source"] in end_ids:
            raise GraphBuildError(
                "End node must not have outgoing edges",
                node_ref=edge["source"],
            )

    # 8. Tool names exist in registry
    state_keys = {f["key"] for f in schema["state"]}
    for node in nodes:
        if node["type"] == "tool":
            tool_name = node["config"]["tool_name"]
            try:
                get_tool(tool_name)
            except Exception as exc:
                raise GraphBuildError(
                    f"Unknown tool: {tool_name}", node_ref=node["id"]
                ) from exc

        # 9. Output keys in state
        if node["type"] in ("llm", "tool"):
            output_key = node["config"]["output_key"]
            if output_key not in state_keys:
                raise GraphBuildError(
                    f"output_key '{output_key}' not found in state fields",
                    node_ref=node["id"],
                )

    # 10–11. Condition validation
    for node in nodes:
        if node["type"] != "condition":
            continue
        config = node["config"]
        branches = config.get("branches", {})

        # 10. All branch targets reference existing nodes
        for branch_name, target_id in branches.items():
            if target_id not in node_ids:
                raise GraphBuildError(
                    f"Condition branch '{branch_name}' references "
                    f"nonexistent node: {target_id}",
                    node_ref=node["id"],
                )

        # 11. default_branch must be a key in branches
        default_branch = config.get("default_branch")
        if default_branch and default_branch not in branches:
            raise GraphBuildError(
                f"default_branch '{default_branch}' is not a key in branches",
                node_ref=node["id"],
            )

        # 12. tool_error source must be a tool node
        condition = config.get("condition", {})
        if condition.get("type") == "tool_error":
            _find_tool_output_key(schema, node["id"])

    # 13. Reachability — BFS from start (warning only, not a blocker)
    reachable: set[str] = set()
    queue: deque[str] = deque([start_id])
    adjacency: dict[str, list[str]] = {}
    for edge in edges:
        adjacency.setdefault(edge["source"], []).append(edge["target"])
    while queue:
        current = queue.popleft()
        if current in reachable:
            continue
        reachable.add(current)
        for neighbor in adjacency.get(current, []):
            if neighbor not in reachable:
                queue.append(neighbor)

    non_structural = {n["id"] for n in nodes if n["type"] not in ("start", "end")}
    unreachable = non_structural - reachable
    if unreachable:
        logger.warning("Unreachable nodes: %s", unreachable)


# ---------------------------------------------------------------------------
# Node function factories
# ---------------------------------------------------------------------------


def _format_inputs(inputs: dict) -> str:
    """Format resolved inputs as a string for LLM messages.

    Single key → its string value. Multiple keys → ``key: value`` lines.
    """
    if len(inputs) == 1:
        return str(next(iter(inputs.values())))
    return "\n".join(f"{k}: {v}" for k, v in inputs.items())


def _make_llm_node(node_id: str, config: dict, llm) -> callable:
    """Return an async node function that calls an LLM."""

    async def llm_node(state: dict) -> dict:
        inputs = resolve_input_map(config["input_map"], state)
        messages = []
        if config.get("system_prompt"):
            messages.append(SystemMessage(content=config["system_prompt"]))
        user_content = _format_inputs(inputs)
        messages.append(HumanMessage(content=user_content))
        response = await llm.ainvoke(messages)
        return {config["output_key"]: response.content}

    llm_node.__name__ = f"llm_{node_id}"
    return llm_node


def _make_tool_node(node_id: str, config: dict) -> callable:
    """Return a sync node function that runs a tool."""

    def tool_node(state: dict) -> dict:
        tool = get_tool(config["tool_name"])
        inputs = resolve_input_map(config["input_map"], state)
        result = tool.run(inputs)
        return {config["output_key"]: result}

    tool_node.__name__ = f"tool_{node_id}"
    return tool_node


def _make_passthrough_node() -> callable:
    """Return a node function that does nothing (for condition nodes)."""

    def passthrough(state: dict) -> dict:
        return {}

    return passthrough


def _make_human_node(node_id: str, config: dict) -> callable:
    """Return a node function that interrupts for human input."""

    def human_node(state: dict) -> dict:
        value = interrupt(
            {
                "prompt": config["prompt"],
                "input_key": config["input_key"],
                "node_id": node_id,
            }
        )
        return {config["input_key"]: value}

    human_node.__name__ = f"human_{node_id}"
    return human_node


def _create_node_function(node: dict, schema: dict, llm_override=None) -> callable:
    """Create the appropriate node function for a given node."""
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
        case _:
            raise GraphBuildError(
                f"Unknown node type: {node['type']}", node_ref=node["id"]
            )


# ---------------------------------------------------------------------------
# Condition routing functions
# ---------------------------------------------------------------------------


def _router_field_equals(condition: dict, default: str) -> callable:
    def router(state: dict) -> str:
        if state.get(condition["field"]) == condition["value"]:
            return condition["branch"]
        return default

    return router


def _router_field_contains(condition: dict, default: str) -> callable:
    def router(state: dict) -> str:
        field_val = state.get(condition["field"], "")
        if condition["value"] in str(field_val):
            return condition["branch"]
        return default

    return router


def _router_field_exists(condition: dict, default: str) -> callable:
    def router(state: dict) -> str:
        if condition["field"] in state and state[condition["field"]] is not None:
            return condition["branch"]
        return default

    return router


def _router_llm(condition: dict, default: str, llm_override=None) -> callable:
    async def router(state: dict) -> str:
        options = condition["options"]
        prompt = (
            f"{condition['prompt']}\n\n"
            f"Respond with exactly one of: {', '.join(options)}"
        )
        routing_llm = llm_override or get_llm(
            "openai",
            condition.get("routing_model", "gpt-4o-mini"),
            0.0,
            100,
        )
        response = await routing_llm.ainvoke([HumanMessage(content=prompt)])
        choice = response.content.strip().lower()
        # Sort by length descending to avoid partial matches
        for opt in sorted(options, key=len, reverse=True):
            if opt.lower() in choice:
                return opt
        return default

    return router


def _router_tool_error(condition: dict, tool_output_key: str) -> callable:
    def router(state: dict) -> str:
        tool_output = state.get(tool_output_key, {})
        if isinstance(tool_output, dict) and tool_output.get("success"):
            return condition["on_success"]
        return condition["on_error"]

    return router


def _router_iteration_limit(condition: dict) -> callable:
    def router(state: dict) -> str:
        count = state.get(condition["field"], 0)
        if count >= condition["max"]:
            return condition["exceeded"]
        return condition["continue"]

    return router


def _make_router(
    node_id: str, config: dict, schema: dict, llm_override=None
) -> callable:
    """Create a routing function for a condition node."""
    condition = config["condition"]
    default = config.get("default_branch", "")

    match condition["type"]:
        case "field_equals":
            router = _router_field_equals(condition, default)
        case "field_contains":
            router = _router_field_contains(condition, default)
        case "field_exists":
            router = _router_field_exists(condition, default)
        case "llm_router":
            router = _router_llm(condition, default, llm_override)
        case "tool_error":
            tool_output_key = _find_tool_output_key(schema, node_id)
            router = _router_tool_error(condition, tool_output_key)
        case "iteration_limit":
            router = _router_iteration_limit(condition)
        case _:
            raise GraphBuildError(
                f"Unknown condition type: {condition['type']}",
                node_ref=node_id,
            )

    router.__name__ = f"route_{node_id}"
    return router


# ---------------------------------------------------------------------------
# build_graph — main entry point
# ---------------------------------------------------------------------------


def build_graph(
    schema: dict,
    *,
    llm_override=None,
) -> BuildResult:
    """Build a LangGraph StateGraph from a GraphSchema dict.

    Returns a BuildResult with the compiled graph and state defaults.
    Use ainvoke()/astream() — never sync invoke() in async contexts (FastAPI).
    Graphs with human_input nodes require
    config={"configurable": {"thread_id": "..."}}.
    Resume after interrupt requires Command(resume=value) as input.

    Raises:
        GraphBuildError: If the graph cannot be compiled.
    """
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

    # 5. Add nodes (skip start/end — they map to START/END constants)
    for node in schema["nodes"]:
        if node["type"] in ("start", "end"):
            continue
        node_fn = _create_node_function(node, schema, llm_override)
        graph.add_node(node["id"], node_fn)

    # 6. Wire edges — translate start/end IDs to START/END constants
    condition_ids = {n["id"] for n in schema["nodes"] if n["type"] == "condition"}
    cond_edges: dict[str, dict[str, str]] = {}

    for edge in schema["edges"]:
        source = START if edge["source"] == start_id else edge["source"]
        target = END if edge["target"] in end_ids else edge["target"]

        if edge["source"] in condition_ids:
            branch = edge.get("condition_branch")
            if not branch:
                raise GraphBuildError(
                    "Edge from condition node missing condition_branch",
                    node_ref=edge["source"],
                )
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
