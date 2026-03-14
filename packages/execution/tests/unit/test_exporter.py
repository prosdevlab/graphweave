"""Exporter tests — code generation from GraphSchema."""

from __future__ import annotations

import ast

import pytest

from app.exporter import ExportError, export_graph


def _base_schema(**overrides):
    """Minimal valid schema: start → end."""
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
                "id": "e",
                "type": "end",
                "label": "End",
                "position": {"x": 0, "y": 200},
                "config": {},
            },
        ],
        "edges": [{"id": "e1", "source": "s", "target": "e"}],
        "metadata": {},
    }
    schema.update(overrides)
    return schema


def _add_llm_node(schema, node_id="llm_1", provider="openai", model="gpt-4o"):
    schema["nodes"].insert(
        -1,
        {
            "id": node_id,
            "type": "llm",
            "label": "LLM",
            "position": {"x": 0, "y": 100},
            "config": {
                "provider": provider,
                "model": model,
                "temperature": 0.7,
                "max_tokens": 1024,
                "input_map": {"question": "result"},
                "output_key": "result",
                "system_prompt": "You are helpful.",
            },
        },
    )
    # Rewire: s → llm → e
    schema["edges"] = [
        {"id": "e1", "source": "s", "target": node_id},
        {"id": "e2", "source": node_id, "target": "e"},
    ]


def _add_tool_node(schema, node_id="tool_1", tool_name="calculator"):
    schema["nodes"].insert(
        -1,
        {
            "id": node_id,
            "type": "tool",
            "label": "Tool",
            "position": {"x": 0, "y": 100},
            "config": {
                "tool_name": tool_name,
                "input_map": {"expression": "result"},
                "output_key": "result",
            },
        },
    )
    schema["edges"] = [
        {"id": "e1", "source": "s", "target": node_id},
        {"id": "e2", "source": node_id, "target": "e"},
    ]


def test_export_linear_graph():
    schema = _base_schema()
    _add_llm_node(schema)
    result = export_graph(schema)

    assert "code" in result
    assert "requirements" in result
    assert "class GraphState(TypedDict):" in result["code"]
    assert "async def llm_1" in result["code"]
    assert "compiled = graph.compile()" in result["code"]


def test_export_with_tool_node():
    schema = _base_schema()
    _add_tool_node(schema)
    result = export_graph(schema)

    assert "def tool_1" in result["code"]
    assert "calculator" in result["code"]


def test_export_with_condition():
    schema = _base_schema()
    _add_tool_node(schema, "tool_1")
    schema["nodes"].insert(
        -1,
        {
            "id": "cond_1",
            "type": "condition",
            "label": "Check",
            "position": {"x": 0, "y": 150},
            "config": {
                "condition": {
                    "type": "field_equals",
                    "field": "result",
                    "value": "42",
                    "branch": "match",
                },
                "default_branch": "no_match",
            },
        },
    )
    schema["edges"] = [
        {"id": "e1", "source": "s", "target": "tool_1"},
        {"id": "e2", "source": "tool_1", "target": "cond_1"},
        {"id": "e3", "source": "cond_1", "target": "e", "condition_branch": "match"},
        {"id": "e4", "source": "cond_1", "target": "e", "condition_branch": "no_match"},
    ]
    result = export_graph(schema)

    assert "def route_cond_1" in result["code"]
    assert "add_conditional_edges" in result["code"]


def test_export_with_human_input():
    schema = _base_schema()
    schema["nodes"].insert(
        -1,
        {
            "id": "ask",
            "type": "human_input",
            "label": "Ask",
            "position": {"x": 0, "y": 100},
            "config": {"prompt": "Enter value", "input_key": "result"},
        },
    )
    schema["edges"] = [
        {"id": "e1", "source": "s", "target": "ask"},
        {"id": "e2", "source": "ask", "target": "e"},
    ]
    result = export_graph(schema)

    assert "interrupt" in result["code"]
    assert "InMemorySaver" in result["code"]
    assert "checkpointer" in result["code"]


def test_export_requirements_openai():
    schema = _base_schema()
    _add_llm_node(schema, provider="openai")
    result = export_graph(schema)

    assert "langchain-openai" in result["requirements"]
    assert "langgraph" in result["requirements"]
    assert "langchain-core" in result["requirements"]


def test_export_requirements_multi_provider():
    schema = _base_schema()
    _add_llm_node(schema, "llm_1", provider="openai")
    # Add a second LLM node with anthropic
    schema["nodes"].insert(
        -1,
        {
            "id": "llm_2",
            "type": "llm",
            "label": "LLM2",
            "position": {"x": 100, "y": 100},
            "config": {
                "provider": "anthropic",
                "model": "claude-sonnet-4-6",
                "input_map": {},
                "output_key": "result",
            },
        },
    )
    result = export_graph(schema)

    assert "langchain-openai" in result["requirements"]
    assert "langchain-anthropic" in result["requirements"]


def test_export_requirements_no_llm():
    schema = _base_schema()
    _add_tool_node(schema, tool_name="calculator")
    result = export_graph(schema)

    assert "langchain-openai" not in result["requirements"]
    assert "langchain-anthropic" not in result["requirements"]
    assert "langgraph" in result["requirements"]
    assert "simpleeval" in result["requirements"]


def test_export_state_typeddict():
    schema = _base_schema(
        state=[
            {"key": "messages", "type": "list", "reducer": "append"},
            {"key": "result", "type": "string", "reducer": "replace"},
            {"key": "data", "type": "object", "reducer": "merge"},
            {"key": "items", "type": "list", "reducer": "append"},
        ]
    )
    result = export_graph(schema)

    assert "class GraphState(TypedDict):" in result["code"]
    assert "Annotated[list, add_messages]" in result["code"]
    assert "result: str" in result["code"]
    assert "Annotated[dict, _merge_reducer]" in result["code"]
    assert "Annotated[list, operator.add]" in result["code"]


def test_export_code_compiles():
    schema = _base_schema()
    _add_llm_node(schema)
    result = export_graph(schema)

    # Should not raise SyntaxError
    compile(result["code"], "<export>", "exec")


def test_export_code_ast_structure():
    schema = _base_schema()
    _add_llm_node(schema)
    _add_tool_node(schema, "tool_1")
    # Rewire: s → llm_1 → tool_1 → e
    schema["edges"] = [
        {"id": "e1", "source": "s", "target": "llm_1"},
        {"id": "e2", "source": "llm_1", "target": "tool_1"},
        {"id": "e3", "source": "tool_1", "target": "e"},
    ]
    result = export_graph(schema)

    tree = ast.parse(result["code"])
    names = {
        node.name
        for node in ast.walk(tree)
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef))
    }

    assert "GraphState" in names
    assert "llm_1" in names
    assert "tool_1" in names


def test_export_complex_graph():
    """Graph with LLM + tool + condition + human_input — all node types."""
    schema = _base_schema(
        state=[
            {"key": "messages", "type": "list", "reducer": "append"},
            {"key": "result", "type": "string", "reducer": "replace"},
            {"key": "answer", "type": "string", "reducer": "replace"},
        ]
    )
    schema["nodes"] = [
        {
            "id": "s",
            "type": "start",
            "label": "S",
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
                "input_map": {"q": "result"},
                "output_key": "result",
                "temperature": 0.5,
                "max_tokens": 512,
            },
        },
        {
            "id": "tool_1",
            "type": "tool",
            "label": "Calc",
            "position": {"x": 0, "y": 200},
            "config": {
                "tool_name": "calculator",
                "input_map": {"expression": "result"},
                "output_key": "result",
            },
        },
        {
            "id": "ask",
            "type": "human_input",
            "label": "Ask",
            "position": {"x": 0, "y": 300},
            "config": {
                "prompt": "Confirm?",
                "input_key": "answer",
            },
        },
        {
            "id": "cond_1",
            "type": "condition",
            "label": "Check",
            "position": {"x": 0, "y": 400},
            "config": {
                "condition": {
                    "type": "field_equals",
                    "field": "answer",
                    "value": "yes",
                    "branch": "done",
                },
                "default_branch": "retry",
            },
        },
        {
            "id": "e",
            "type": "end",
            "label": "E",
            "position": {"x": 0, "y": 500},
            "config": {},
        },
    ]
    schema["edges"] = [
        {"id": "e1", "source": "s", "target": "llm_1"},
        {"id": "e2", "source": "llm_1", "target": "tool_1"},
        {"id": "e3", "source": "tool_1", "target": "ask"},
        {"id": "e4", "source": "ask", "target": "cond_1"},
        {"id": "e5", "source": "cond_1", "target": "e", "condition_branch": "done"},
        {
            "id": "e6",
            "source": "cond_1",
            "target": "llm_1",
            "condition_branch": "retry",
        },
    ]

    result = export_graph(schema)

    # Should compile
    compile(result["code"], "<export>", "exec")

    # All node functions present
    tree = ast.parse(result["code"])
    names = {
        node.name
        for node in ast.walk(tree)
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef))
    }
    assert "GraphState" in names
    assert "llm_1" in names
    assert "tool_1" in names
    assert "ask" in names
    assert "cond_1" in names
    assert "route_cond_1" in names

    # Has checkpointer (human_input present)
    assert "InMemorySaver" in result["code"]


# ── Security: identifier injection prevention ────────────────────────


def test_malicious_node_id_rejected():
    """node_id with code injection is rejected."""
    schema = _base_schema()
    schema["nodes"].insert(
        -1,
        {
            "id": "x(s):\n    import os\ndef y",
            "type": "tool",
            "label": "Evil",
            "position": {"x": 0, "y": 100},
            "config": {
                "tool_name": "calculator",
                "input_map": {"expression": "result"},
                "output_key": "result",
            },
        },
    )
    with pytest.raises(ExportError, match="Unsafe identifier"):
        export_graph(schema)


def test_malicious_output_key_rejected():
    """output_key with injection characters is rejected."""
    schema = _base_schema()
    schema["nodes"].insert(
        -1,
        {
            "id": "tool_1",
            "type": "tool",
            "label": "Tool",
            "position": {"x": 0, "y": 100},
            "config": {
                "tool_name": "calculator",
                "input_map": {"expression": "result"},
                "output_key": 'result"}\nimport os',
            },
        },
    )
    with pytest.raises(ExportError, match="Unsafe identifier"):
        export_graph(schema)
