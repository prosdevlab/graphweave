"""Manual test 7: Start run + stream SSE events.

Verifies the full SSE event lifecycle for a linear graph:
  run_started → node_started → node_completed → edge_traversed → graph_completed

Uses RunManager + executor directly (no HTTP server needed).

Usage: cd packages/execution && uv run python tests/manual/test_07_sse_events.py
"""

import asyncio

from langchain_core.language_models import FakeListChatModel
from langgraph.checkpoint.memory import InMemorySaver

from app.builder import build_graph
from app.executor import RunManager, stream_run_sse


def make_schema():
    return {
        "id": "sse-test",
        "name": "SSE Event Test",
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
                    "system_prompt": "Be helpful.",
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


class FakeDB:
    """Stub DB that accepts update_run calls without a real database."""

    async def execute(self, *args, **kwargs):
        pass

    async def commit(self):
        pass


async def main():
    print("Test 07: Start run + stream SSE events")
    print("-" * 50)

    schema = make_schema()
    mock = FakeListChatModel(responses=["The answer is 42."])
    saver = InMemorySaver()
    result = build_graph(schema, llm_override=mock, checkpointer=saver)

    run_manager = RunManager()
    run_id = "test-run-07"
    config = {"configurable": {"thread_id": run_id}}

    ctx = await run_manager.start_run(
        run_id=run_id,
        graph_id="graph-07",
        owner_id="owner-1",
        compiled_graph=result.graph,
        config=config,
        input_data={"messages": [("human", "What is 6 * 7?")]},
        defaults=result.defaults,
        schema_dict=schema,
        db=FakeDB(),
    )

    # Collect all SSE strings
    sse_chunks = []
    async for chunk in stream_run_sse(ctx):
        sse_chunks.append(chunk)

    # Parse event types from the SSE output
    event_types = []
    for chunk in sse_chunks:
        for line in chunk.strip().split("\n"):
            if line.startswith("event: "):
                event_types.append(line[7:])

    print(f"\n  Events received ({len(event_types)}):")
    for i, evt in enumerate(event_types, 1):
        print(f"    {i}. {evt}")

    # Verify expected sequence
    expected = [
        "run_started",
        "node_started",
        "node_completed",
        "edge_traversed",
        "graph_completed",
    ]

    assert event_types[0] == "run_started", (
        f"First should be run_started, got {event_types[0]}"
    )
    assert event_types[-1] == "graph_completed", (
        f"Last should be graph_completed, got {event_types[-1]}"
    )

    for evt in expected:
        assert evt in event_types, f"Missing event: {evt}"

    # Verify all events have sequential IDs
    ids = []
    for chunk in sse_chunks:
        for line in chunk.strip().split("\n"):
            if line.startswith("id: "):
                ids.append(int(line[4:]))
    assert ids == sorted(ids), f"Event IDs not sequential: {ids}"
    assert ids == list(range(1, len(ids) + 1)), f"Event IDs not starting from 1: {ids}"

    print(f"\n  Event IDs: {ids}")
    print("\n  PASS")


if __name__ == "__main__":
    asyncio.run(main())
