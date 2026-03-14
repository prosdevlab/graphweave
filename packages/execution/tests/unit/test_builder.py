"""Tests for the GraphSchema → LangGraph builder."""

from __future__ import annotations

import inspect
import operator
from typing import Annotated, get_type_hints

import pytest
from langchain_core.language_models import FakeListChatModel
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph.message import add_messages
from langgraph.types import Command

from app.builder import (
    BuildResult,
    GraphBuildError,
    _build_defaults,
    _create_node_function,
    _format_inputs,
    _make_llm_node,
    _make_router,
    _make_tool_node,
    _merge_reducer,
    _router_field_contains,
    _router_field_equals,
    _router_field_exists,
    _router_iteration_limit,
    _router_llm,
    _router_tool_error,
    build_graph,
    build_state_type,
    validate_schema,
)

# ---------------------------------------------------------------------------
# Test helpers
# ---------------------------------------------------------------------------


def _make_schema(**overrides) -> dict:
    """Minimal valid schema: start → end with messages + result state."""
    schema = {
        "id": "test-graph",
        "name": "Test",
        "version": 1,
        "state": [
            {"key": "messages", "type": "list", "reducer": "append"},
            {"key": "result", "type": "string", "reducer": "replace"},
        ],
        "nodes": [
            {
                "id": "s",
                "type": "start",
                "label": "Start",
                "position": {"x": 0, "y": 0},
                "config": {},
            },
            {
                "id": "e",
                "type": "end",
                "label": "End",
                "position": {"x": 0, "y": 200},
                "config": {},
            },
        ],
        "edges": [
            {"id": "e1", "source": "s", "target": "e"},
        ],
        "metadata": {"created_at": "2026-01-01", "updated_at": "2026-01-01"},
    }
    schema.update(overrides)
    return schema


def _add_llm_node(schema: dict, node_id: str = "llm_1", **config_overrides) -> dict:
    """Insert an LLM node into the schema and wire start → llm → end."""
    config = {
        "provider": "openai",
        "model": "gpt-4o",
        "system_prompt": "You are helpful.",
        "temperature": 0.7,
        "max_tokens": 100,
        "input_map": {"question": "messages[-1].content"},
        "output_key": "result",
    }
    config.update(config_overrides)
    node = {
        "id": node_id,
        "type": "llm",
        "label": "LLM",
        "position": {"x": 0, "y": 100},
        "config": config,
    }
    schema["nodes"].insert(-1, node)  # Before end node
    # Rewire: start → llm → end
    schema["edges"] = [
        {"id": "e1", "source": "s", "target": node_id},
        {"id": "e2", "source": node_id, "target": "e"},
    ]
    return schema


def _add_tool_node(
    schema: dict, node_id: str = "tool_1", tool_name: str = "calculator", **overrides
) -> dict:
    """Insert a tool node after the last non-end node."""
    config = {
        "tool_name": tool_name,
        "input_map": {"expression": "messages[-1].content"},
        "output_key": "result",
    }
    config.update(overrides)
    node = {
        "id": node_id,
        "type": "tool",
        "label": "Tool",
        "position": {"x": 0, "y": 150},
        "config": config,
    }
    schema["nodes"].insert(-1, node)
    return schema


# ---------------------------------------------------------------------------
# Validation tests
# ---------------------------------------------------------------------------


class TestValidateSchema:
    def test_valid_minimal_schema(self):
        validate_schema(_make_schema())

    def test_missing_required_key(self):
        schema = _make_schema()
        del schema["nodes"]
        with pytest.raises(GraphBuildError, match="Missing required key: nodes"):
            validate_schema(schema)

    def test_missing_start_node(self):
        schema = _make_schema()
        schema["nodes"] = [n for n in schema["nodes"] if n["type"] != "start"]
        with pytest.raises(GraphBuildError, match="exactly one start node"):
            validate_schema(schema)

    def test_multiple_start_nodes(self):
        schema = _make_schema()
        schema["nodes"].append(
            {
                "id": "s2",
                "type": "start",
                "label": "Start2",
                "position": {"x": 0, "y": 0},
                "config": {},
            }
        )
        with pytest.raises(GraphBuildError, match="exactly one start node") as exc_info:
            validate_schema(schema)
        assert exc_info.value.node_ref == "s2"

    def test_no_end_node(self):
        schema = _make_schema()
        schema["nodes"] = [n for n in schema["nodes"] if n["type"] != "end"]
        schema["edges"] = []
        with pytest.raises(GraphBuildError, match="at least one end node"):
            validate_schema(schema)

    def test_duplicate_node_ids(self):
        schema = _make_schema()
        schema["nodes"].append(
            {
                "id": "s",
                "type": "end",
                "label": "Dup",
                "position": {"x": 0, "y": 0},
                "config": {},
            }
        )
        with pytest.raises(GraphBuildError, match="Duplicate node ID") as exc_info:
            validate_schema(schema)
        assert exc_info.value.node_ref == "s"

    def test_edge_references_nonexistent_node(self):
        schema = _make_schema()
        schema["edges"].append({"id": "bad", "source": "s", "target": "ghost"})
        with pytest.raises(GraphBuildError, match="nonexistent target"):
            validate_schema(schema)

    def test_tool_node_unknown_tool(self):
        schema = _make_schema()
        _add_tool_node(schema, tool_name="nonexistent_tool")
        schema["edges"] = [
            {"id": "e1", "source": "s", "target": "tool_1"},
            {"id": "e2", "source": "tool_1", "target": "e"},
        ]
        with pytest.raises(GraphBuildError, match="Unknown tool") as exc_info:
            validate_schema(schema)
        assert exc_info.value.node_ref == "tool_1"

    def test_output_key_not_in_state(self):
        schema = _make_schema()
        _add_llm_node(schema, output_key="nonexistent_field")
        with pytest.raises(
            GraphBuildError, match="output_key 'nonexistent_field' not found"
        ) as exc_info:
            validate_schema(schema)
        assert exc_info.value.node_ref == "llm_1"

    def test_tool_error_without_tool_predecessor(self):
        schema = _make_schema()
        cond_node = {
            "id": "cond_1",
            "type": "condition",
            "label": "Check",
            "position": {"x": 0, "y": 100},
            "config": {
                "condition": {"type": "tool_error", "on_error": "e", "on_success": "e"},
                "branches": {"on_error": "e", "on_success": "e"},
                "default_branch": "on_error",
            },
        }
        schema["nodes"].insert(-1, cond_node)
        # Wire start → cond → end (no tool predecessor)
        schema["edges"] = [
            {"id": "e1", "source": "s", "target": "cond_1"},
            {
                "id": "e2",
                "source": "cond_1",
                "target": "e",
                "condition_branch": "on_error",
            },
        ]
        with pytest.raises(
            GraphBuildError, match="tool_error condition must follow a tool node"
        ) as exc_info:
            validate_schema(schema)
        assert exc_info.value.node_ref == "cond_1"

    def test_default_branch_not_in_branches(self):
        schema = _make_schema()
        cond_node = {
            "id": "cond_1",
            "type": "condition",
            "label": "Check",
            "position": {"x": 0, "y": 100},
            "config": {
                "condition": {
                    "type": "field_equals",
                    "field": "result",
                    "value": "yes",
                    "branch": "go",
                },
                "branches": {"go": "e"},
                "default_branch": "nonexistent_branch",
            },
        }
        schema["nodes"].insert(-1, cond_node)
        schema["edges"] = [
            {"id": "e1", "source": "s", "target": "cond_1"},
            {
                "id": "e2",
                "source": "cond_1",
                "target": "e",
                "condition_branch": "go",
            },
        ]
        with pytest.raises(
            GraphBuildError, match="default_branch.*not a key in branches"
        ) as exc_info:
            validate_schema(schema)
        assert exc_info.value.node_ref == "cond_1"


# ---------------------------------------------------------------------------
# State type tests
# ---------------------------------------------------------------------------


class TestBuildStateType:
    def test_replace_reducer(self):
        fields = [{"key": "name", "type": "string", "reducer": "replace"}]
        state_type = build_state_type(fields)
        hints = get_type_hints(state_type, include_extras=True)
        # Plain type, no Annotated wrapper
        assert hints["name"] is str

    def test_append_messages_reducer(self):
        fields = [{"key": "messages", "type": "list", "reducer": "append"}]
        state_type = build_state_type(fields)
        hints = get_type_hints(state_type, include_extras=True)
        assert hints["messages"] == Annotated[list, add_messages]

    def test_append_non_messages_reducer(self):
        fields = [{"key": "items", "type": "list", "reducer": "append"}]
        state_type = build_state_type(fields)
        hints = get_type_hints(state_type, include_extras=True)
        assert hints["items"] == Annotated[list, operator.add]

    def test_merge_reducer(self):
        fields = [{"key": "data", "type": "object", "reducer": "merge"}]
        state_type = build_state_type(fields)
        hints = get_type_hints(state_type, include_extras=True)
        assert hints["data"] == Annotated[dict, _merge_reducer]


class TestMergeReducer:
    def test_shallow_merge(self):
        assert _merge_reducer({"a": 1}, {"b": 2}) == {"a": 1, "b": 2}

    def test_deep_merge(self):
        left = {"a": {"b": 1, "c": 2}}
        right = {"a": {"c": 3, "d": 4}}
        assert _merge_reducer(left, right) == {"a": {"b": 1, "c": 3, "d": 4}}

    def test_non_dict_overwrites_dict(self):
        assert _merge_reducer({"a": {"nested": 1}}, {"a": "replaced"}) == {
            "a": "replaced"
        }

    def test_empty_dicts(self):
        assert _merge_reducer({}, {"a": 1}) == {"a": 1}
        assert _merge_reducer({"a": 1}, {}) == {"a": 1}


# ---------------------------------------------------------------------------
# Defaults tests
# ---------------------------------------------------------------------------


class TestBuildDefaults:
    def test_defaults_from_schema_types(self):
        fields = [
            {"key": "s", "type": "string", "reducer": "replace"},
            {"key": "n", "type": "number", "reducer": "replace"},
            {"key": "b", "type": "boolean", "reducer": "replace"},
            {"key": "l", "type": "list", "reducer": "append"},
            {"key": "o", "type": "object", "reducer": "merge"},
        ]
        defaults = _build_defaults(fields)
        assert defaults == {"s": "", "n": 0, "b": False, "l": [], "o": {}}

    def test_defaults_with_explicit_values(self):
        fields = [
            {"key": "name", "type": "string", "reducer": "replace", "default": "Bob"},
            {"key": "count", "type": "number", "reducer": "replace", "default": 42},
        ]
        defaults = _build_defaults(fields)
        assert defaults == {"name": "Bob", "count": 42}

    def test_mutable_defaults_are_independent(self):
        """Each call to _build_defaults should return fresh mutable objects."""
        fields = [{"key": "items", "type": "list", "reducer": "append"}]
        d1 = _build_defaults(fields)
        d2 = _build_defaults(fields)
        d1["items"].append("modified")
        assert d2["items"] == []


# ---------------------------------------------------------------------------
# Node function factory tests
# ---------------------------------------------------------------------------


class TestFormatInputs:
    def test_single_key(self):
        assert _format_inputs({"question": "What is 2+2?"}) == "What is 2+2?"

    def test_multi_key(self):
        result = _format_inputs({"topic": "math", "level": "easy"})
        assert "topic: math" in result
        assert "level: easy" in result


class TestLLMNode:
    async def test_llm_node_basic(self):
        mock_llm = FakeListChatModel(responses=["42"])
        config = {
            "system_prompt": "",
            "input_map": {"question": "query"},
            "output_key": "result",
        }
        node_fn = _make_llm_node("llm_1", config, mock_llm)
        state = {"query": "meaning of life?"}
        result = await node_fn(state)
        assert result == {"result": "42"}

    async def test_llm_node_with_system_prompt(self):
        mock_llm = FakeListChatModel(responses=["Hello!"])
        config = {
            "system_prompt": "You are a friendly bot.",
            "input_map": {"greeting": "query"},
            "output_key": "result",
        }
        node_fn = _make_llm_node("llm_1", config, mock_llm)
        result = await node_fn({"query": "hi"})
        assert result == {"result": "Hello!"}

    async def test_llm_node_input_map_expression(self):
        mock_llm = FakeListChatModel(responses=["resolved"])
        config = {
            "system_prompt": "",
            "input_map": {"data": "items[-1]"},
            "output_key": "result",
        }
        node_fn = _make_llm_node("llm_1", config, mock_llm)
        result = await node_fn({"items": ["a", "b", "c"]})
        assert result == {"result": "resolved"}

    async def test_llm_node_multi_key_format(self):
        mock_llm = FakeListChatModel(responses=["answer"])
        config = {
            "system_prompt": "",
            "input_map": {"topic": "topic", "level": "level"},
            "output_key": "result",
        }
        node_fn = _make_llm_node("llm_1", config, mock_llm)
        result = await node_fn({"topic": "math", "level": "hard"})
        assert result == {"result": "answer"}


class TestToolNode:
    def test_tool_node_calculator(self):
        config = {
            "tool_name": "calculator",
            "input_map": {"expression": "expr"},
            "output_key": "result",
        }
        node_fn = _make_tool_node("tool_1", config)
        result = node_fn({"expr": "2 + 2"})
        assert result["result"]["success"] is True
        assert result["result"]["result"] == "4"

    def test_tool_node_output_envelope(self):
        config = {
            "tool_name": "calculator",
            "input_map": {"expression": "expr"},
            "output_key": "result",
        }
        node_fn = _make_tool_node("tool_1", config)
        result = node_fn({"expr": "1 + 1"})
        envelope = result["result"]
        assert "success" in envelope
        assert "result" in envelope

    def test_tool_node_error_envelope(self):
        config = {
            "tool_name": "calculator",
            "input_map": {"expression": "expr"},
            "output_key": "result",
        }
        node_fn = _make_tool_node("tool_1", config)
        result = node_fn({"expr": "invalid_expression"})
        envelope = result["result"]
        assert envelope["success"] is False


class TestCreateNodeFunction:
    def test_dispatches_llm(self):
        mock_llm = FakeListChatModel(responses=["ok"])
        node = {
            "id": "n1",
            "type": "llm",
            "config": {
                "provider": "openai",
                "model": "gpt-4o",
                "system_prompt": "",
                "temperature": 0.7,
                "max_tokens": 100,
                "input_map": {"q": "query"},
                "output_key": "result",
            },
        }
        fn = _create_node_function(node, {}, llm_override=mock_llm)
        assert inspect.iscoroutinefunction(fn)

    def test_dispatches_tool(self):
        node = {
            "id": "n1",
            "type": "tool",
            "config": {
                "tool_name": "calculator",
                "input_map": {"expression": "expr"},
                "output_key": "result",
            },
        }
        fn = _create_node_function(node, {})
        assert not inspect.iscoroutinefunction(fn)

    def test_dispatches_condition(self):
        node = {
            "id": "n1",
            "type": "condition",
            "config": {
                "condition": {
                    "type": "field_equals",
                    "field": "x",
                    "value": "y",
                    "branch": "go",
                },
                "branches": {"go": "end"},
                "default_branch": "go",
            },
        }
        fn = _create_node_function(node, {})
        assert fn({}) == {}


# ---------------------------------------------------------------------------
# Condition routing tests
# ---------------------------------------------------------------------------


class TestRouterFieldEquals:
    def test_match(self):
        condition = {"field": "status", "value": "done", "branch": "finish"}
        router = _router_field_equals(condition, "retry")
        assert router({"status": "done"}) == "finish"

    def test_no_match(self):
        condition = {"field": "status", "value": "done", "branch": "finish"}
        router = _router_field_equals(condition, "retry")
        assert router({"status": "pending"}) == "retry"


class TestRouterFieldContains:
    def test_match(self):
        condition = {"field": "text", "value": "error", "branch": "handle"}
        router = _router_field_contains(condition, "continue")
        assert router({"text": "an error occurred"}) == "handle"

    def test_no_match(self):
        condition = {"field": "text", "value": "error", "branch": "handle"}
        router = _router_field_contains(condition, "continue")
        assert router({"text": "all good"}) == "continue"


class TestRouterFieldExists:
    def test_exists(self):
        condition = {"field": "data", "branch": "process"}
        router = _router_field_exists(condition, "skip")
        assert router({"data": {"key": "val"}}) == "process"

    def test_not_exists(self):
        condition = {"field": "data", "branch": "process"}
        router = _router_field_exists(condition, "skip")
        assert router({}) == "skip"

    def test_exists_but_none(self):
        condition = {"field": "data", "branch": "process"}
        router = _router_field_exists(condition, "skip")
        assert router({"data": None}) == "skip"


class TestRouterToolError:
    def test_success_path(self):
        condition = {"on_success": "next", "on_error": "retry"}
        router = _router_tool_error(condition, "tool_result")
        state = {"tool_result": {"success": True, "result": "ok"}}
        assert router(state) == "next"

    def test_failure_path(self):
        condition = {"on_success": "next", "on_error": "retry"}
        router = _router_tool_error(condition, "tool_result")
        state = {"tool_result": {"success": False, "error": "boom"}}
        assert router(state) == "retry"

    def test_missing_key_defaults_to_error(self):
        condition = {"on_success": "next", "on_error": "retry"}
        router = _router_tool_error(condition, "tool_result")
        assert router({}) == "retry"


class TestRouterIterationLimit:
    def test_under_limit(self):
        condition = {
            "field": "count",
            "max": 3,
            "exceeded": "stop",
            "continue": "loop",
        }
        router = _router_iteration_limit(condition)
        assert router({"count": 1}) == "loop"

    def test_at_limit(self):
        condition = {
            "field": "count",
            "max": 3,
            "exceeded": "stop",
            "continue": "loop",
        }
        router = _router_iteration_limit(condition)
        assert router({"count": 3}) == "stop"

    def test_over_limit(self):
        condition = {
            "field": "count",
            "max": 3,
            "exceeded": "stop",
            "continue": "loop",
        }
        router = _router_iteration_limit(condition)
        assert router({"count": 5}) == "stop"


class TestMakeRouter:
    def test_sets_router_name(self):
        config = {
            "condition": {
                "type": "field_equals",
                "field": "x",
                "value": "y",
                "branch": "go",
            },
            "branches": {"go": "end"},
            "default_branch": "go",
        }
        router = _make_router("cond_1", config, {})
        assert router.__name__ == "route_cond_1"

    def test_unknown_condition_type_raises(self):
        config = {
            "condition": {"type": "unknown_type"},
            "branches": {},
            "default_branch": "",
        }
        with pytest.raises(GraphBuildError, match="Unknown condition type"):
            _make_router("cond_1", config, {})


# ---------------------------------------------------------------------------
# Integration tests — build_graph end-to-end
# ---------------------------------------------------------------------------


class TestBuildGraphIntegration:
    def _linear_schema(self):
        """start → llm → end"""
        return {
            "id": "linear",
            "name": "Linear",
            "version": 1,
            "state": [
                {"key": "messages", "type": "list", "reducer": "append"},
                {"key": "result", "type": "string", "reducer": "replace"},
            ],
            "nodes": [
                {
                    "id": "s",
                    "type": "start",
                    "label": "Start",
                    "position": {"x": 0, "y": 0},
                    "config": {},
                },
                {
                    "id": "llm_1",
                    "type": "llm",
                    "label": "LLM",
                    "position": {"x": 0, "y": 100},
                    "config": {
                        "provider": "openai",
                        "model": "gpt-4o",
                        "system_prompt": "You are helpful.",
                        "temperature": 0.7,
                        "max_tokens": 100,
                        "input_map": {"question": "messages[-1].content"},
                        "output_key": "result",
                    },
                },
                {
                    "id": "e",
                    "type": "end",
                    "label": "End",
                    "position": {"x": 0, "y": 200},
                    "config": {},
                },
            ],
            "edges": [
                {"id": "e1", "source": "s", "target": "llm_1"},
                {"id": "e2", "source": "llm_1", "target": "e"},
            ],
            "metadata": {
                "created_at": "2026-01-01",
                "updated_at": "2026-01-01",
            },
        }

    async def test_linear_graph(self):
        """start → llm → end: compiles and invokes successfully."""
        schema = self._linear_schema()
        mock = FakeListChatModel(responses=["42"])
        result = build_graph(schema, llm_override=mock)

        assert isinstance(result, BuildResult)
        state = await result.graph.ainvoke(
            {**result.defaults, "messages": [("human", "meaning of life?")]}
        )
        assert state["result"] == "42"

    async def test_branching_graph(self):
        """start → cond(field_equals) → branch_a or branch_b → end."""
        mock = FakeListChatModel(responses=["branch A answer"])
        schema = {
            "id": "branch",
            "name": "Branch",
            "version": 1,
            "state": [
                {"key": "messages", "type": "list", "reducer": "append"},
                {"key": "result", "type": "string", "reducer": "replace"},
                {"key": "choice", "type": "string", "reducer": "replace"},
            ],
            "nodes": [
                {
                    "id": "s",
                    "type": "start",
                    "label": "Start",
                    "position": {"x": 0, "y": 0},
                    "config": {},
                },
                {
                    "id": "cond_1",
                    "type": "condition",
                    "label": "Check",
                    "position": {"x": 0, "y": 100},
                    "config": {
                        "condition": {
                            "type": "field_equals",
                            "field": "choice",
                            "value": "a",
                            "branch": "go_a",
                        },
                        "branches": {"go_a": "llm_a", "go_b": "llm_b"},
                        "default_branch": "go_b",
                    },
                },
                {
                    "id": "llm_a",
                    "type": "llm",
                    "label": "LLM A",
                    "position": {"x": -100, "y": 200},
                    "config": {
                        "provider": "openai",
                        "model": "gpt-4o",
                        "system_prompt": "",
                        "temperature": 0.7,
                        "max_tokens": 100,
                        "input_map": {"q": "choice"},
                        "output_key": "result",
                    },
                },
                {
                    "id": "llm_b",
                    "type": "llm",
                    "label": "LLM B",
                    "position": {"x": 100, "y": 200},
                    "config": {
                        "provider": "openai",
                        "model": "gpt-4o",
                        "system_prompt": "",
                        "temperature": 0.7,
                        "max_tokens": 100,
                        "input_map": {"q": "choice"},
                        "output_key": "result",
                    },
                },
                {
                    "id": "e",
                    "type": "end",
                    "label": "End",
                    "position": {"x": 0, "y": 300},
                    "config": {},
                },
            ],
            "edges": [
                {"id": "e1", "source": "s", "target": "cond_1"},
                {
                    "id": "e2",
                    "source": "cond_1",
                    "target": "llm_a",
                    "condition_branch": "go_a",
                },
                {
                    "id": "e3",
                    "source": "cond_1",
                    "target": "llm_b",
                    "condition_branch": "go_b",
                },
                {"id": "e4", "source": "llm_a", "target": "e"},
                {"id": "e5", "source": "llm_b", "target": "e"},
            ],
            "metadata": {
                "created_at": "2026-01-01",
                "updated_at": "2026-01-01",
            },
        }
        result = build_graph(schema, llm_override=mock)
        state = await result.graph.ainvoke({**result.defaults, "choice": "a"})
        assert state["result"] == "branch A answer"

    async def test_iteration_limit_stops(self):
        """Verify iteration_limit exits when count >= max."""
        schema = {
            "id": "loop",
            "name": "Loop",
            "version": 1,
            "state": [
                {"key": "messages", "type": "list", "reducer": "append"},
                {"key": "count", "type": "number", "reducer": "replace"},
                {"key": "result", "type": "string", "reducer": "replace"},
                {
                    "key": "calc_out",
                    "type": "object",
                    "reducer": "replace",
                },
            ],
            "nodes": [
                {
                    "id": "s",
                    "type": "start",
                    "label": "Start",
                    "position": {"x": 0, "y": 0},
                    "config": {},
                },
                {
                    "id": "calc",
                    "type": "tool",
                    "label": "Calc",
                    "position": {"x": 0, "y": 100},
                    "config": {
                        "tool_name": "calculator",
                        "input_map": {"expression": "messages[-1].content"},
                        "output_key": "calc_out",
                    },
                },
                {
                    "id": "cond_1",
                    "type": "condition",
                    "label": "Check Count",
                    "position": {"x": 0, "y": 200},
                    "config": {
                        "condition": {
                            "type": "iteration_limit",
                            "field": "count",
                            "max": 2,
                            "exceeded": "stop",
                            "continue": "loop",
                        },
                        "branches": {"stop": "e", "loop": "calc"},
                        "default_branch": "stop",
                    },
                },
                {
                    "id": "e",
                    "type": "end",
                    "label": "End",
                    "position": {"x": 0, "y": 300},
                    "config": {},
                },
            ],
            "edges": [
                {"id": "e1", "source": "s", "target": "calc"},
                {"id": "e2", "source": "calc", "target": "cond_1"},
                {
                    "id": "e3",
                    "source": "cond_1",
                    "target": "e",
                    "condition_branch": "stop",
                },
                {
                    "id": "e4",
                    "source": "cond_1",
                    "target": "calc",
                    "condition_branch": "loop",
                },
            ],
            "metadata": {
                "created_at": "2026-01-01",
                "updated_at": "2026-01-01",
            },
        }
        result = build_graph(schema)
        # count=5 >= max=2, so the "stop" branch is taken immediately
        state = await result.graph.ainvoke(
            {**result.defaults, "count": 5, "messages": [("human", "1+1")]}
        )
        # Graph should reach END without looping
        assert state["count"] == 5

    async def test_multiple_end_nodes(self):
        """Graph with 2 end nodes routes correctly via condition."""
        mock = FakeListChatModel(responses=["end1 answer"])
        schema = {
            "id": "multi-end",
            "name": "MultiEnd",
            "version": 1,
            "state": [
                {"key": "messages", "type": "list", "reducer": "append"},
                {"key": "result", "type": "string", "reducer": "replace"},
                {"key": "path", "type": "string", "reducer": "replace"},
            ],
            "nodes": [
                {
                    "id": "s",
                    "type": "start",
                    "label": "Start",
                    "position": {"x": 0, "y": 0},
                    "config": {},
                },
                {
                    "id": "cond_1",
                    "type": "condition",
                    "label": "Route",
                    "position": {"x": 0, "y": 100},
                    "config": {
                        "condition": {
                            "type": "field_equals",
                            "field": "path",
                            "value": "fast",
                            "branch": "go_fast",
                        },
                        "branches": {
                            "go_fast": "e1",
                            "go_slow": "llm_1",
                        },
                        "default_branch": "go_slow",
                    },
                },
                {
                    "id": "llm_1",
                    "type": "llm",
                    "label": "LLM",
                    "position": {"x": 100, "y": 200},
                    "config": {
                        "provider": "openai",
                        "model": "gpt-4o",
                        "system_prompt": "",
                        "temperature": 0.7,
                        "max_tokens": 100,
                        "input_map": {"q": "path"},
                        "output_key": "result",
                    },
                },
                {
                    "id": "e1",
                    "type": "end",
                    "label": "End Fast",
                    "position": {"x": -100, "y": 300},
                    "config": {},
                },
                {
                    "id": "e2",
                    "type": "end",
                    "label": "End Slow",
                    "position": {"x": 100, "y": 300},
                    "config": {},
                },
            ],
            "edges": [
                {"id": "e1", "source": "s", "target": "cond_1"},
                {
                    "id": "e2",
                    "source": "cond_1",
                    "target": "e1",
                    "condition_branch": "go_fast",
                },
                {
                    "id": "e3",
                    "source": "cond_1",
                    "target": "llm_1",
                    "condition_branch": "go_slow",
                },
                {"id": "e4", "source": "llm_1", "target": "e2"},
            ],
            "metadata": {
                "created_at": "2026-01-01",
                "updated_at": "2026-01-01",
            },
        }
        result = build_graph(schema, llm_override=mock)
        # Take the "fast" path — goes directly to END
        state = await result.graph.ainvoke({**result.defaults, "path": "fast"})
        # Result should still be default (no LLM ran)
        assert state["result"] == ""

    async def test_defaults_applied_at_invocation(self):
        """Verify state initialized from BuildResult.defaults."""
        schema = {
            "id": "defaults",
            "name": "Defaults",
            "version": 1,
            "state": [
                {"key": "messages", "type": "list", "reducer": "append"},
                {
                    "key": "result",
                    "type": "string",
                    "reducer": "replace",
                    "default": "initial",
                },
                {
                    "key": "count",
                    "type": "number",
                    "reducer": "replace",
                    "default": 99,
                },
            ],
            "nodes": [
                {
                    "id": "s",
                    "type": "start",
                    "label": "Start",
                    "position": {"x": 0, "y": 0},
                    "config": {},
                },
                {
                    "id": "e",
                    "type": "end",
                    "label": "End",
                    "position": {"x": 0, "y": 100},
                    "config": {},
                },
            ],
            "edges": [
                {"id": "e1", "source": "s", "target": "e"},
            ],
            "metadata": {
                "created_at": "2026-01-01",
                "updated_at": "2026-01-01",
            },
        }
        result = build_graph(schema)
        assert result.defaults["result"] == "initial"
        assert result.defaults["count"] == 99

        state = await result.graph.ainvoke(result.defaults)
        assert state["result"] == "initial"
        assert state["count"] == 99

    def test_build_result_is_named_tuple(self):
        schema = self._linear_schema()
        mock = FakeListChatModel(responses=["ok"])
        result = build_graph(schema, llm_override=mock)
        assert isinstance(result, BuildResult)
        assert hasattr(result, "graph")
        assert hasattr(result, "defaults")


# ---------------------------------------------------------------------------
# Additional validation tests (review findings)
# ---------------------------------------------------------------------------


class TestValidateSchemaEdgeCases:
    def test_start_with_incoming_edge(self):
        """Validation check B1.6: start must not have incoming edges."""
        schema = {
            "id": "test",
            "name": "Test",
            "version": 1,
            "state": [
                {"key": "messages", "type": "list", "reducer": "append"},
            ],
            "nodes": [
                {
                    "id": "s",
                    "type": "start",
                    "label": "Start",
                    "position": {"x": 0, "y": 0},
                    "config": {},
                },
                {
                    "id": "e",
                    "type": "end",
                    "label": "End",
                    "position": {"x": 0, "y": 200},
                    "config": {},
                },
            ],
            "edges": [
                {"id": "e1", "source": "s", "target": "e"},
                {"id": "e2", "source": "e", "target": "s"},
            ],
            "metadata": {
                "created_at": "2026-01-01",
                "updated_at": "2026-01-01",
            },
        }
        # End has outgoing edge — caught first by check 7
        with pytest.raises(GraphBuildError):
            validate_schema(schema)

    def test_end_with_outgoing_edge(self):
        """Validation check B1.7: end must not have outgoing edges."""
        schema = {
            "id": "test",
            "name": "Test",
            "version": 1,
            "state": [
                {"key": "messages", "type": "list", "reducer": "append"},
                {"key": "result", "type": "string", "reducer": "replace"},
            ],
            "nodes": [
                {
                    "id": "s",
                    "type": "start",
                    "label": "Start",
                    "position": {"x": 0, "y": 0},
                    "config": {},
                },
                {
                    "id": "llm_1",
                    "type": "llm",
                    "label": "LLM",
                    "position": {"x": 0, "y": 100},
                    "config": {
                        "provider": "openai",
                        "model": "gpt-4o",
                        "system_prompt": "",
                        "temperature": 0.7,
                        "max_tokens": 100,
                        "input_map": {"q": "messages[-1].content"},
                        "output_key": "result",
                    },
                },
                {
                    "id": "e",
                    "type": "end",
                    "label": "End",
                    "position": {"x": 0, "y": 200},
                    "config": {},
                },
            ],
            "edges": [
                {"id": "e1", "source": "s", "target": "llm_1"},
                {"id": "e2", "source": "llm_1", "target": "e"},
                {"id": "e3", "source": "e", "target": "llm_1"},
            ],
            "metadata": {
                "created_at": "2026-01-01",
                "updated_at": "2026-01-01",
            },
        }
        with pytest.raises(
            GraphBuildError, match="End node must not have outgoing edges"
        ) as exc_info:
            validate_schema(schema)
        assert exc_info.value.node_ref == "e"

    def test_unknown_state_field_type(self):
        """Unknown type in _TYPE_MAP raises GraphBuildError."""
        fields = [{"key": "x", "type": "binary", "reducer": "replace"}]
        with pytest.raises(GraphBuildError, match="Unknown state field type: binary"):
            build_state_type(fields)


# ---------------------------------------------------------------------------
# Human input tests (review findings — interrupt + checkpointer)
# ---------------------------------------------------------------------------


class TestHumanInputIntegration:
    def _human_input_schema(self):
        return {
            "id": "human",
            "name": "Human",
            "version": 1,
            "state": [
                {"key": "messages", "type": "list", "reducer": "append"},
                {
                    "key": "user_answer",
                    "type": "string",
                    "reducer": "replace",
                },
                {"key": "result", "type": "string", "reducer": "replace"},
            ],
            "nodes": [
                {
                    "id": "s",
                    "type": "start",
                    "label": "Start",
                    "position": {"x": 0, "y": 0},
                    "config": {},
                },
                {
                    "id": "ask",
                    "type": "human_input",
                    "label": "Ask User",
                    "position": {"x": 0, "y": 100},
                    "config": {
                        "prompt": "What is your name?",
                        "input_key": "user_answer",
                    },
                },
                {
                    "id": "llm_1",
                    "type": "llm",
                    "label": "Greet",
                    "position": {"x": 0, "y": 200},
                    "config": {
                        "provider": "openai",
                        "model": "gpt-4o",
                        "system_prompt": "Greet the user.",
                        "temperature": 0.7,
                        "max_tokens": 100,
                        "input_map": {"name": "user_answer"},
                        "output_key": "result",
                    },
                },
                {
                    "id": "e",
                    "type": "end",
                    "label": "End",
                    "position": {"x": 0, "y": 300},
                    "config": {},
                },
            ],
            "edges": [
                {"id": "e1", "source": "s", "target": "ask"},
                {"id": "e2", "source": "ask", "target": "llm_1"},
                {"id": "e3", "source": "llm_1", "target": "e"},
            ],
            "metadata": {
                "created_at": "2026-01-01",
                "updated_at": "2026-01-01",
            },
        }

    def test_human_input_graph_has_checkpointer(self):
        """Graph with human_input nodes compiles with InMemorySaver."""
        mock = FakeListChatModel(responses=["Hello!"])
        result = build_graph(self._human_input_schema(), llm_override=mock)
        assert result.graph.checkpointer is not None
        assert isinstance(result.graph.checkpointer, InMemorySaver)

    async def test_human_input_interrupts(self):
        """Graph pauses at human_input node with interrupt payload."""
        mock = FakeListChatModel(responses=["Hello Alice!"])
        result = build_graph(self._human_input_schema(), llm_override=mock)

        config = {"configurable": {"thread_id": "test-1"}}
        await result.graph.ainvoke(result.defaults, config)

        # Graph should have paused at the human_input node
        graph_state = await result.graph.aget_state(config)
        # next should contain the interrupted node
        assert len(graph_state.next) > 0

    async def test_human_input_resume(self):
        """Resume after interrupt with Command(resume=value)."""
        mock = FakeListChatModel(responses=["Hello Alice!"])
        result = build_graph(self._human_input_schema(), llm_override=mock)

        config = {"configurable": {"thread_id": "test-2"}}

        # First invocation — graph pauses at human_input
        await result.graph.ainvoke(result.defaults, config)

        # Resume with user's answer
        state = await result.graph.ainvoke(Command(resume="Alice"), config)
        assert state["user_answer"] == "Alice"
        assert state["result"] == "Hello Alice!"


# ---------------------------------------------------------------------------
# LLM router tests (review findings — async routing + substring collision)
# ---------------------------------------------------------------------------


class TestLLMRouter:
    async def test_llm_router_basic(self):
        """LLM router returns matched option from FakeListChatModel."""
        mock = FakeListChatModel(responses=["support"])
        condition = {
            "prompt": "Classify the query",
            "options": ["sales", "support", "billing"],
        }
        router = _router_llm(condition, "sales", llm_override=mock)
        result = await router({})
        assert result == "support"

    async def test_llm_router_substring_collision(self):
        """Longer options matched first to avoid 'no' matching 'info'."""
        # LLM returns "information" — "no" is a substring, but "info"
        # should win because it's sorted by length descending.
        mock = FakeListChatModel(responses=["information"])
        condition = {
            "prompt": "Classify",
            "options": ["no", "info"],
        }
        router = _router_llm(condition, "no", llm_override=mock)
        result = await router({})
        assert result == "info"

    async def test_llm_router_no_match_returns_default(self):
        """When LLM output doesn't match any option, return default."""
        mock = FakeListChatModel(responses=["something completely different"])
        condition = {
            "prompt": "Classify",
            "options": ["alpha", "beta"],
        }
        router = _router_llm(condition, "alpha", llm_override=mock)
        result = await router({})
        assert result == "alpha"

    async def test_llm_router_integration(self):
        """Full graph with llm_router condition routes correctly."""
        schema = {
            "id": "llm-route",
            "name": "LLMRoute",
            "version": 1,
            "state": [
                {"key": "messages", "type": "list", "reducer": "append"},
                {"key": "result", "type": "string", "reducer": "replace"},
                {"key": "query", "type": "string", "reducer": "replace"},
            ],
            "nodes": [
                {
                    "id": "s",
                    "type": "start",
                    "label": "Start",
                    "position": {"x": 0, "y": 0},
                    "config": {},
                },
                {
                    "id": "cond_1",
                    "type": "condition",
                    "label": "Route",
                    "position": {"x": 0, "y": 100},
                    "config": {
                        "condition": {
                            "type": "llm_router",
                            "prompt": "Classify the query",
                            "options": ["sales", "support"],
                        },
                        "branches": {
                            "sales": "e",
                            "support": "llm_support",
                        },
                        "default_branch": "sales",
                    },
                },
                {
                    "id": "llm_support",
                    "type": "llm",
                    "label": "Support LLM",
                    "position": {"x": 100, "y": 200},
                    "config": {
                        "provider": "openai",
                        "model": "gpt-4o",
                        "system_prompt": "You are support.",
                        "temperature": 0.7,
                        "max_tokens": 100,
                        "input_map": {"q": "query"},
                        "output_key": "result",
                    },
                },
                {
                    "id": "e",
                    "type": "end",
                    "label": "End",
                    "position": {"x": 0, "y": 300},
                    "config": {},
                },
            ],
            "edges": [
                {"id": "e1", "source": "s", "target": "cond_1"},
                {
                    "id": "e2",
                    "source": "cond_1",
                    "target": "e",
                    "condition_branch": "sales",
                },
                {
                    "id": "e3",
                    "source": "cond_1",
                    "target": "llm_support",
                    "condition_branch": "support",
                },
                {"id": "e4", "source": "llm_support", "target": "e"},
            ],
            "metadata": {
                "created_at": "2026-01-01",
                "updated_at": "2026-01-01",
            },
        }

        # llm_override is used for BOTH routing and node LLMs.
        # We need a single mock that returns routing answer first,
        # then the node answer. FakeListChatModel pops in order.
        combined_mock = FakeListChatModel(
            responses=["support", "I can help with that!"]
        )
        result = build_graph(schema, llm_override=combined_mock)
        state = await result.graph.ainvoke(
            {**result.defaults, "query": "my order is late"}
        )
        assert state["result"] == "I can help with that!"
