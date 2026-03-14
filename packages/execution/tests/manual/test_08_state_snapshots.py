"""Manual test 8: State snapshots in node_completed events.

Verifies that each node_completed event includes a full state_snapshot
showing the state after that node ran.

Usage: cd packages/execution && uv run python tests/manual/test_08_state_snapshots.py
"""

import asyncio

from langchain_core.language_models import FakeListChatModel
from langgraph.checkpoint.memory import InMemorySaver

from app.builder import build_graph
from app.executor import RunManager, stream_run_sse


def make_schema():
    """Two LLM nodes in sequence to verify state evolves across snapshots."""
    return {
        "id": "snapshot-test",
        "name": "Snapshot Test",
        "version": 1,
        "state": [
            {"key": "messages", "type": "list", "reducer": "append"},
            {"key": "step1_out", "type": "string", "reducer": "replace"},
            {"key": "step2_out", "type": "string", "reducer": "replace"},
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
                "id": "llm_a",
                "type": "llm",
                "label": "Step 1",
                "position": {"x": 0, "y": 100},
                "config": {
                    "provider": "openai",
                    "model": "gpt-4o",
                    "system_prompt": "Translate to French.",
                    "temperature": 0,
                    "max_tokens": 50,
                    "input_map": {"text": "messages[-1].content"},
                    "output_key": "step1_out",
                },
            },
            {
                "id": "llm_b",
                "type": "llm",
                "label": "Step 2",
                "position": {"x": 0, "y": 200},
                "config": {
                    "provider": "openai",
                    "model": "gpt-4o",
                    "system_prompt": "Translate to German.",
                    "temperature": 0,
                    "max_tokens": 50,
                    "input_map": {"text": "step1_out"},
                    "output_key": "step2_out",
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
            {"id": "e1", "source": "s", "target": "llm_a"},
            {"id": "e2", "source": "llm_a", "target": "llm_b"},
            {"id": "e3", "source": "llm_b", "target": "e"},
        ],
        "metadata": {"created_at": "2026-01-01", "updated_at": "2026-01-01"},
    }


class FakeDB:
    async def execute(self, *args, **kwargs):
        pass

    async def commit(self):
        pass


async def main():
    print("Test 08: State snapshots in node_completed events")
    print("-" * 50)

    schema = make_schema()
    mock = FakeListChatModel(responses=["Bonjour", "Guten Tag"])
    saver = InMemorySaver()
    result = build_graph(schema, llm_override=mock, checkpointer=saver)

    run_manager = RunManager()
    run_id = "test-run-08"

    ctx = await run_manager.start_run(
        run_id=run_id,
        graph_id="graph-08",
        owner_id="owner-1",
        compiled_graph=result.graph,
        config={"configurable": {"thread_id": run_id}},
        input_data={"messages": [("human", "Hello")]},
        defaults=result.defaults,
        schema_dict=schema,
        db=FakeDB(),
    )

    # Collect events
    async for _ in stream_run_sse(ctx):
        pass

    # Extract node_completed events
    completed_events = [e for e in ctx.events if e["event"] == "node_completed"]

    print(f"\n  node_completed events: {len(completed_events)}")

    for evt in completed_events:
        data = evt["data"]
        node_id = data["node_id"]
        snapshot = data["state_snapshot"]
        print(f"\n  Node: {node_id}")
        print(f"    output:         {data['output']}")
        print(f"    duration_ms:    {data['duration_ms']}")
        print(f"    step1_out:      {snapshot.get('step1_out', '<not set>')}")
        print(f"    step2_out:      {snapshot.get('step2_out', '<not set>')}")

    # After llm_a: step1_out should be set, step2_out should not
    snap_a = completed_events[0]["data"]["state_snapshot"]
    assert snap_a["step1_out"] == "Bonjour", (
        f"Expected 'Bonjour', got {snap_a['step1_out']}"
    )
    assert snap_a.get("step2_out", "") == "", "step2_out should not be set after llm_a"

    # After llm_b: both should be set
    snap_b = completed_events[1]["data"]["state_snapshot"]
    assert snap_b["step1_out"] == "Bonjour", (
        f"step1_out should persist, got {snap_b['step1_out']}"
    )
    assert snap_b["step2_out"] == "Guten Tag", (
        f"Expected 'Guten Tag', got {snap_b['step2_out']}"
    )

    print("\n  PASS")


if __name__ == "__main__":
    asyncio.run(main())
