"""Manual test 36: Export and exec — verify generated code is executable.

Usage: cd packages/execution && uv run python tests/manual/test_36_exporter_exec.py
"""

import ast

from app.exporter import export_graph


def _linear_schema():
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
                "label": "S",
                "position": {"x": 0, "y": 0},
                "config": {},
            },
            {
                "id": "tool_1",
                "type": "tool",
                "label": "Calc",
                "position": {"x": 0, "y": 100},
                "config": {
                    "tool_name": "calculator",
                    "input_map": {"expression": "result"},
                    "output_key": "result",
                },
            },
            {
                "id": "e",
                "type": "end",
                "label": "E",
                "position": {"x": 0, "y": 200},
                "config": {},
            },
        ],
        "edges": [
            {"id": "e1", "source": "s", "target": "tool_1"},
            {"id": "e2", "source": "tool_1", "target": "e"},
        ],
        "metadata": {},
    }


def _complex_schema():
    return {
        "id": "complex",
        "name": "Complex",
        "version": 1,
        "state": [
            {"key": "messages", "type": "list", "reducer": "append"},
            {"key": "result", "type": "string", "reducer": "replace"},
            {"key": "data", "type": "object", "reducer": "merge"},
            {"key": "items", "type": "list", "reducer": "append"},
            {"key": "answer", "type": "string", "reducer": "replace"},
        ],
        "nodes": [
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
                    "system_prompt": "You are helpful.",
                    "temperature": 0.7,
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
        ],
        "edges": [
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
        ],
        "metadata": {},
    }


def main():
    print("── Test 36: Exporter exec ──")

    # 1. Linear graph — compile + exec
    result = export_graph(_linear_schema())
    compile(result["code"], "<linear>", "exec")
    ns = {}
    exec(compile(result["code"], "<linear>", "exec"), ns)
    assert "compiled" in ns, "No 'compiled' graph in namespace"
    assert "GraphState" in ns, "No 'GraphState' class in namespace"
    print("  ✓ Linear graph: compiles and exec's, 'compiled' graph exists")

    # 2. Complex graph — compile + AST check
    result = export_graph(_complex_schema())
    compile(result["code"], "<complex>", "exec")

    tree = ast.parse(result["code"])
    names = {
        node.name
        for node in ast.walk(tree)
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef))
    }
    expected = {"GraphState", "llm_1", "tool_1", "ask", "cond_1", "route_cond_1"}
    missing = expected - names
    assert not missing, f"Missing definitions: {missing}"
    print(f"  ✓ Complex graph: all {len(expected)} definitions present")

    # 3. Check requirements
    assert "langgraph" in result["requirements"]
    assert "langchain-openai" in result["requirements"]
    assert "simpleeval" in result["requirements"]
    print(f"  ✓ Requirements:\n    {result['requirements']}")

    # 4. State class has TypedDict
    assert "class GraphState(TypedDict):" in result["code"]
    assert "Annotated[list, add_messages]" in result["code"]
    assert "Annotated[dict, _merge_reducer]" in result["code"]
    print("  ✓ State class: TypedDict with correct reducers")

    # 5. Human input → checkpointer
    assert "InMemorySaver" in result["code"]
    assert "interrupt" in result["code"]
    print("  ✓ Human input: InMemorySaver + interrupt present")

    print(f"\n  Generated code ({len(result['code'])} chars):")
    for line in result["code"].split("\n")[:30]:
        print(f"    {line}")
    print("    ...")

    print("\n✅ All exporter exec tests passed")


if __name__ == "__main__":
    main()
