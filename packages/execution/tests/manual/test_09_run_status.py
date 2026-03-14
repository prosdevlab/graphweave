"""Manual test 9: Run status transitions.

Verifies RunManager reports correct status at each lifecycle stage:
  running → completed (with duration_ms)

Usage: cd packages/execution && uv run python tests/manual/test_09_run_status.py
"""

import asyncio

from langchain_core.language_models import FakeListChatModel
from langgraph.checkpoint.memory import InMemorySaver

from app.builder import build_graph
from app.executor import RunManager, stream_run_sse


def make_schema():
    return {
        "id": "status-test",
        "name": "Status Test",
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
    print("Test 09: Run status transitions")
    print("-" * 50)

    schema = make_schema()
    mock = FakeListChatModel(responses=["42"])
    saver = InMemorySaver()
    result = build_graph(schema, llm_override=mock, checkpointer=saver)

    run_manager = RunManager()
    run_id = "test-run-09"

    ctx = await run_manager.start_run(
        run_id=run_id,
        graph_id="graph-09",
        owner_id="owner-1",
        compiled_graph=result.graph,
        config={"configurable": {"thread_id": run_id}},
        input_data={"messages": [("human", "Hi")]},
        defaults=result.defaults,
        schema_dict=schema,
        db=FakeDB(),
    )

    # Immediately after start, status should be running
    live_ctx = run_manager.get_run(run_id)
    assert live_ctx is not None, "Run should be in RunManager"
    print(f"\n  After start:    status={live_ctx.status}")
    assert live_ctx.status == "running", f"Expected 'running', got {live_ctx.status}"

    # Drain the SSE stream (run completes)
    async for _ in stream_run_sse(ctx):
        pass

    # After completion, check status
    print(f"  After complete: status={ctx.status}")
    assert ctx.status == "completed", f"Expected 'completed', got {ctx.status}"

    # Verify graph_completed event has duration_ms
    completed_events = [e for e in ctx.events if e["event"] == "graph_completed"]
    assert len(completed_events) == 1, "Should have exactly one graph_completed event"
    duration = completed_events[0]["data"]["duration_ms"]
    print(f"  Duration:       {duration}ms")
    assert duration >= 0, f"Duration should be non-negative, got {duration}"

    # Verify final_state is present
    final_state = completed_events[0]["data"]["final_state"]
    print(f"  Final result:   '{final_state.get('result', '<missing>')}'")
    assert final_state.get("result") == "42", (
        f"Expected '42', got {final_state.get('result')}"
    )

    print("\n  PASS")


if __name__ == "__main__":
    asyncio.run(main())
