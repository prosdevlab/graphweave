"""Manual test 4: Tool node + tool_error condition routing.

start → calculator tool → condition(tool_error) → success or error path → end

Uses FakeListChatModel for the error recovery LLM (no key needed for that path).
The calculator tool is real.

Usage: cd packages/execution && uv run python scripts/test_04_tool_and_condition.py
"""

import asyncio

from langchain_core.language_models import FakeListChatModel

from app.builder import build_graph


def make_schema(expression: str):
    return {
        "id": "tool-cond",
        "name": "Tool + Condition",
        "version": 1,
        "state": [
            {"key": "messages", "type": "list", "reducer": "append"},
            {"key": "expr", "type": "string", "reducer": "replace"},
            {"key": "calc_out", "type": "object", "reducer": "replace"},
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
                "id": "calc",
                "type": "tool",
                "label": "Calculator",
                "position": {"x": 0, "y": 100},
                "config": {
                    "tool_name": "calculator",
                    "input_map": {"expression": "expr"},
                    "output_key": "calc_out",
                },
            },
            {
                "id": "check",
                "type": "condition",
                "label": "Check Error",
                "position": {"x": 0, "y": 200},
                "config": {
                    "condition": {
                        "type": "tool_error",
                        "on_error": "handle_err",
                        "on_success": "done",
                    },
                    "branches": {"handle_err": "llm_err", "done": "e"},
                    "default_branch": "done",
                },
            },
            {
                "id": "llm_err",
                "type": "llm",
                "label": "Error Handler",
                "position": {"x": -100, "y": 300},
                "config": {
                    "provider": "gemini",
                    "model": "gemini-2.0-flash",
                    "system_prompt": "Explain the math error simply.",
                    "temperature": 0,
                    "max_tokens": 50,
                    "input_map": {"error": "calc_out"},
                    "output_key": "result",
                },
            },
            {
                "id": "e",
                "type": "end",
                "label": "End",
                "position": {"x": 0, "y": 400},
                "config": {},
            },
        ],
        "edges": [
            {"id": "e1", "source": "s", "target": "calc"},
            {"id": "e2", "source": "calc", "target": "check"},
            {
                "id": "e3",
                "source": "check",
                "target": "llm_err",
                "condition_branch": "handle_err",
            },
            {
                "id": "e4",
                "source": "check",
                "target": "e",
                "condition_branch": "done",
            },
            {"id": "e5", "source": "llm_err", "target": "e"},
        ],
        "metadata": {"created_at": "2026-01-01", "updated_at": "2026-01-01"},
    }


async def main():
    print("Test 04: Tool node + tool_error condition routing")
    print("-" * 50)

    # Success path: valid expression
    print("\n  Path A: valid expression '2 + 3 * 4'")
    schema = make_schema("2 + 3 * 4")
    mock = FakeListChatModel(responses=["should not be called"])
    result = build_graph(schema, llm_override=mock)
    state = await result.graph.ainvoke({**result.defaults, "expr": "2 + 3 * 4"})
    print(f"  calc_out: {state['calc_out']}")
    assert state["calc_out"]["success"] is True
    print("  Routed to: success path (END)")

    # Error path: division by zero
    print("\n  Path B: invalid expression '1 / 0'")
    schema = make_schema("1 / 0")
    mock = FakeListChatModel(responses=["Cannot divide by zero."])
    result = build_graph(schema, llm_override=mock)
    state = await result.graph.ainvoke({**result.defaults, "expr": "1 / 0"})
    print(f"  calc_out: {state['calc_out']}")
    assert state["calc_out"]["success"] is False
    print("  Routed to: error path → LLM error handler")
    print(f"  result: {state['result']}")

    print("\n  PASS")


if __name__ == "__main__":
    asyncio.run(main())
