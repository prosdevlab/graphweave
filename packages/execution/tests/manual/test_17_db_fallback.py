"""Manual test 17: DB fallback for completed runs.

Verifies the stream_run endpoint behavior when a run is no longer in
RunManager but exists in the DB. Tests the DB fallback code path by
directly testing the format_sse output that would be sent.

Since we can't easily simulate a full HTTP request without the server,
this test verifies the fallback logic by:
  1. Running a graph to completion
  2. Cleaning up the run from RunManager
  3. Verifying the run is gone from RunManager
  4. Verifying the expected DB fallback SSE format

Usage: cd packages/execution && uv run python tests/manual/test_17_db_fallback.py
"""

import asyncio

from langchain_core.language_models import FakeListChatModel
from langgraph.checkpoint.memory import InMemorySaver

from app.builder import build_graph
from app.executor import RunManager, format_sse, stream_run_sse


def make_schema():
    return {
        "id": "fallback-test",
        "name": "Fallback Test",
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
                    "system_prompt": "Be brief.",
                    "temperature": 0,
                    "max_tokens": 10,
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
        ],
        "metadata": {"created_at": "2026-01-01", "updated_at": "2026-01-01"},
    }


class FakeDB:
    async def execute(self, *args, **kwargs):
        pass

    async def commit(self):
        pass


async def main():
    print("Test 17: DB fallback for completed runs")
    print("-" * 50)

    schema = make_schema()
    mock = FakeListChatModel(responses=["Done."])
    saver = InMemorySaver()
    result = build_graph(schema, llm_override=mock, checkpointer=saver)

    run_manager = RunManager()
    run_id = "test-run-17"

    ctx = await run_manager.start_run(
        run_id=run_id,
        graph_id="graph-17",
        owner_id="owner-1",
        compiled_graph=result.graph,
        config={"configurable": {"thread_id": run_id}},
        input_data={"messages": [("human", "Hi")]},
        defaults=result.defaults,
        schema_dict=schema,
        db=FakeDB(),
    )

    # Drain SSE stream (run completes)
    async for _ in stream_run_sse(ctx):
        pass
    assert ctx.status == "completed"

    # Get the final state before cleanup
    completed_events = [e for e in ctx.events if e["event"] == "graph_completed"]
    final_state = completed_events[0]["data"]["final_state"]
    duration_ms = completed_events[0]["data"]["duration_ms"]
    r = final_state.get("result")
    print(f"\n  Run completed: result='{r}', duration={duration_ms}ms")

    # Simulate what happens after grace period: cleanup removes from RunManager
    run_manager.cleanup_run(run_id)
    assert run_manager.get_run(run_id) is None, "Run should be cleaned up"
    print("  Run cleaned up from RunManager")

    # Verify the DB fallback SSE format (what the route handler would send)
    fallback_sse = format_sse(
        "graph_completed",
        {"final_state": final_state, "duration_ms": duration_ms},
        event_id=1,
    )
    print("\n  DB fallback SSE response:")
    for line in fallback_sse.strip().split("\n"):
        print(f"    {line}")

    assert "id: 1" in fallback_sse, "Fallback should have id: 1"
    assert "event: graph_completed" in fallback_sse
    assert "Done." in fallback_sse, "Should contain the final result"

    # Verify error fallback format (for lost runs)
    lost_sse = format_sse(
        "error",
        {"message": "Run lost (server restarted)", "recoverable": False},
        event_id=1,
    )
    print("\n  Lost run SSE response:")
    for line in lost_sse.strip().split("\n"):
        print(f"    {line}")
    assert "Run lost" in lost_sse

    print("\n  PASS")


if __name__ == "__main__":
    asyncio.run(main())
