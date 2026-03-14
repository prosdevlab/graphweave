"""Manual test 5: Human input node — interrupt and resume.

start → human_input (interrupt) → llm (greet) → end

Simulates the interrupt/resume lifecycle that Phase 3 executor will use.

Usage: cd packages/execution && uv run python tests/manual/test_05_human_input.py
"""

import asyncio

from langchain_core.language_models import FakeListChatModel
from langgraph.types import Command

from app.builder import build_graph


def make_schema():
    return {
        "id": "human-input",
        "name": "Human Input",
        "version": 1,
        "state": [
            {"key": "messages", "type": "list", "reducer": "append"},
            {"key": "user_name", "type": "string", "reducer": "replace"},
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
                "label": "Ask Name",
                "position": {"x": 0, "y": 100},
                "config": {
                    "prompt": "What is your name?",
                    "input_key": "user_name",
                },
            },
            {
                "id": "greet",
                "type": "llm",
                "label": "Greet",
                "position": {"x": 0, "y": 200},
                "config": {
                    "provider": "gemini",
                    "model": "gemini-2.0-flash",
                    "system_prompt": "Greet the user warmly by name.",
                    "temperature": 0.7,
                    "max_tokens": 50,
                    "input_map": {"name": "user_name"},
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
            {"id": "e2", "source": "ask", "target": "greet"},
            {"id": "e3", "source": "greet", "target": "e"},
        ],
        "metadata": {"created_at": "2026-01-01", "updated_at": "2026-01-01"},
    }


async def main():
    print("Test 05: Human input — interrupt and resume")
    print("-" * 50)

    schema = make_schema()
    mock = FakeListChatModel(responses=["Hello Alice! Welcome!"])
    result = build_graph(schema, llm_override=mock)

    config = {"configurable": {"thread_id": "manual-test-1"}}

    # Step 1: Invoke — graph should pause at human_input
    print("\n  Step 1: Initial invoke (should pause at human_input)")
    state = await result.graph.ainvoke(result.defaults, config)

    graph_state = await result.graph.aget_state(config)
    print(f"  Paused at: {graph_state.next}")
    assert len(graph_state.next) > 0, "Graph did not pause!"

    # Step 2: Resume with user's answer
    print("\n  Step 2: Resume with user answer 'Alice'")
    state = await result.graph.ainvoke(Command(resume="Alice"), config)

    print(f"  user_name: {state['user_name']}")
    print(f"  result:    {state['result']}")
    assert state["user_name"] == "Alice"
    assert len(state["result"]) > 0

    print("\n  PASS")


if __name__ == "__main__":
    asyncio.run(main())
