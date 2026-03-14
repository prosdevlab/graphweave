"""Manual test 10: Human input pause/resume via executor.

start → human_input → llm → end

Verifies:
  1. Graph pauses at human_input node
  2. graph_paused SSE event emitted with prompt + node_id
  3. submit_resume() wakes the executor
  4. Graph completes after resume

Usage: cd packages/execution && uv run python tests/manual/test_10_human_input_resume.py
"""

import asyncio

from langchain_core.language_models import FakeListChatModel
from langgraph.checkpoint.memory import InMemorySaver

from app.builder import build_graph
from app.executor import RunManager, stream_run_sse


def make_schema():
    return {
        "id": "human-resume",
        "name": "Human Resume Test",
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
                    "provider": "openai",
                    "model": "gpt-4o",
                    "system_prompt": "Greet the user by name.",
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


class FakeDB:
    async def execute(self, *args, **kwargs):
        pass

    async def commit(self):
        pass


async def main():
    print("Test 10: Human input pause/resume via executor")
    print("-" * 50)

    schema = make_schema()
    mock = FakeListChatModel(responses=["Hello Alice, welcome!"])
    saver = InMemorySaver()
    result = build_graph(schema, llm_override=mock, checkpointer=saver)

    run_manager = RunManager()
    run_id = "test-run-10"

    ctx = await run_manager.start_run(
        run_id=run_id,
        graph_id="graph-10",
        owner_id="owner-1",
        compiled_graph=result.graph,
        config={"configurable": {"thread_id": run_id}},
        input_data={},
        defaults=result.defaults,
        schema_dict=schema,
        db=FakeDB(),
    )

    # Wait for the run to pause (poll status)
    print("\n  Waiting for pause...")
    for _ in range(50):
        if ctx.status == "paused":
            break
        await asyncio.sleep(0.1)

    assert ctx.status == "paused", f"Expected 'paused', got '{ctx.status}'"
    print(f"  Status:    {ctx.status}")
    print(f"  Node ID:   {ctx.paused_node_id}")
    print(f"  Prompt:    {ctx.paused_prompt}")

    # Verify graph_paused event was emitted
    paused_events = [e for e in ctx.events if e["event"] == "graph_paused"]
    assert len(paused_events) == 1, f"Expected 1 graph_paused, got {len(paused_events)}"
    paused_data = paused_events[0]["data"]
    assert paused_data["prompt"] == "What is your name?", (
        f"Wrong prompt: {paused_data['prompt']}"
    )
    assert paused_data["node_id"] == "ask", f"Wrong node_id: {paused_data['node_id']}"
    print(f"  Event:     graph_paused (id={paused_events[0]['id']})")

    # Resume with user input
    print("\n  Resuming with 'Alice'...")
    resumed = await run_manager.submit_resume(run_id, "Alice")
    assert resumed, "submit_resume should return True"

    # Drain SSE stream (run completes after resume)
    async for _ in stream_run_sse(ctx):
        pass

    assert ctx.status == "completed", f"Expected 'completed', got '{ctx.status}'"

    # Verify full event sequence
    event_types = [e["event"] for e in ctx.events]
    print("\n  Full event sequence:")
    for i, evt in enumerate(event_types, 1):
        print(f"    {i}. {evt}")

    assert "graph_paused" in event_types
    assert "graph_completed" in event_types
    assert event_types.index("graph_paused") < event_types.index("graph_completed")

    # Verify final state
    completed = [e for e in ctx.events if e["event"] == "graph_completed"]
    final_state = completed[0]["data"]["final_state"]
    print(f"\n  Final user_name: '{final_state.get('user_name', '<missing>')}'")
    print(f"  Final result:    '{final_state.get('result', '<missing>')}'")

    print("\n  PASS")


if __name__ == "__main__":
    asyncio.run(main())
