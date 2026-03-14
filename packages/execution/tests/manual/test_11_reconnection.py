"""Manual test 11: SSE reconnection with Last-Event-ID.

Verifies:
  1. Event replay buffer stores all events with sequential IDs
  2. Reconnection with last_event_id skips already-seen events
  3. Reconnection from the end returns nothing
  4. format_sse produces correct id: lines for replay

Tests the replay buffer directly (ctx.events) since stream_run_sse's
live queue is consumed by the first reader and can't be re-read.

Usage: cd packages/execution && uv run python tests/manual/test_11_reconnection.py
"""

import asyncio

from langchain_core.language_models import FakeListChatModel
from langgraph.checkpoint.memory import InMemorySaver

from app.builder import build_graph
from app.executor import RunManager, format_sse, stream_run_sse


def make_schema():
    return {
        "id": "reconnect-test",
        "name": "Reconnection Test",
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
    async def execute(self, *args, **kwargs):
        pass

    async def commit(self):
        pass


async def main():
    print("Test 11: SSE reconnection with Last-Event-ID")
    print("-" * 50)

    schema = make_schema()
    mock = FakeListChatModel(responses=["42"])
    saver = InMemorySaver()
    result = build_graph(schema, llm_override=mock, checkpointer=saver)

    run_manager = RunManager()
    run_id = "test-run-11"

    ctx = await run_manager.start_run(
        run_id=run_id,
        graph_id="graph-11",
        owner_id="owner-1",
        compiled_graph=result.graph,
        config={"configurable": {"thread_id": run_id}},
        input_data={"messages": [("human", "Hi")]},
        defaults=result.defaults,
        schema_dict=schema,
        db=FakeDB(),
    )

    # First connection: drain the live stream
    all_chunks = []
    async for chunk in stream_run_sse(ctx):
        all_chunks.append(chunk)

    # Verify all events are in the replay buffer
    all_ids = [e["id"] for e in ctx.events if e["id"] is not None]
    total_events = len(all_ids)
    print(f"\n  Full stream: {total_events} events, IDs: {all_ids}")
    assert total_events >= 3, f"Expected at least 3 events, got {total_events}"
    assert all_ids == list(range(1, total_events + 1)), f"IDs not sequential: {all_ids}"

    # Simulate reconnection: replay events after ID 2
    last_seen_id = 2
    print(f"\n  Reconnecting with Last-Event-ID: {last_seen_id}")
    replayed = [e for e in ctx.events if e["id"] is not None and e["id"] > last_seen_id]
    replay_ids = [e["id"] for e in replayed]
    print(f"  Would replay: {len(replay_ids)} events, IDs: {replay_ids}")

    for eid in replay_ids:
        assert eid > last_seen_id, f"Got event ID {eid} <= {last_seen_id}"

    expected_count = total_events - last_seen_id
    assert len(replay_ids) == expected_count, (
        f"Expected {expected_count} replayed events, got {len(replay_ids)}"
    )

    # Verify format_sse includes id: line for replay
    sample = replayed[0]
    sse_str = format_sse(sample["event"], sample["data"], event_id=sample["id"])
    print("\n  Sample replay SSE:")
    for line in sse_str.strip().split("\n"):
        print(f"    {line}")
    assert f"id: {sample['id']}" in sse_str

    # Reconnect from the very end — nothing to replay
    last_id = all_ids[-1]
    print(f"\n  Reconnecting with Last-Event-ID: {last_id} (last event)")
    replayed_end = [e for e in ctx.events if e["id"] is not None and e["id"] > last_id]
    print(f"  Would replay: {len(replayed_end)} events")
    assert len(replayed_end) == 0, f"Expected 0 events, got {len(replayed_end)}"

    print("\n  PASS")


if __name__ == "__main__":
    asyncio.run(main())
