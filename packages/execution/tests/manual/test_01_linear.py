"""Manual test 1: Linear graph — start → llm → end.

Uses FakeListChatModel (no API key needed).
Verifies the simplest possible graph compiles and invokes.

Usage: cd packages/execution && uv run python tests/manual/test_01_linear.py
"""

import asyncio

from langchain_core.language_models import FakeListChatModel

from app.builder import build_graph


def make_schema():
    return {
        "id": "linear",
        "name": "Linear Smoke Test",
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
        "metadata": {"created_at": "2026-01-01", "updated_at": "2026-01-01"},
    }


async def main():
    print("Test 01: Linear graph (FakeListChatModel)")
    print("-" * 50)

    schema = make_schema()
    mock = FakeListChatModel(responses=["42"])
    result = build_graph(schema, llm_override=mock)

    print(f"  Graph compiled: {type(result.graph).__name__}")
    print(f"  Defaults: {result.defaults}")

    state = await result.graph.ainvoke(
        {**result.defaults, "messages": [("human", "meaning of life?")]}
    )

    print("  Input:  'meaning of life?'")
    print(f"  Output: '{state['result']}'")

    assert state["result"] == "42", f"Expected '42', got '{state['result']}'"
    print("\n  PASS")


if __name__ == "__main__":
    asyncio.run(main())
