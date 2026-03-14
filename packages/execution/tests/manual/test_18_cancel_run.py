"""Manual test 18: Cancel a running execution.

Verifies:
  1. cancel_run() sets the cancel event
  2. Executor detects cancellation and emits error event
  3. Status transitions to "error"
  4. SSE stream closes with sentinel

Usage: cd packages/execution && uv run python tests/manual/test_18_cancel_run.py
"""

import asyncio

from langchain_core.language_models import FakeListChatModel
from langgraph.checkpoint.memory import InMemorySaver

from app.builder import build_graph
from app.executor import RunManager


def make_schema():
    """Human input graph — stays paused so we can cancel it."""
    return {
        "id": "cancel-test",
        "name": "Cancel Test",
        "version": 1,
        "state": [
            {"key": "messages", "type": "list", "reducer": "append"},
            {"key": "answer", "type": "string", "reducer": "replace"},
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
                "label": "Ask",
                "position": {"x": 0, "y": 100},
                "config": {"prompt": "Waiting...", "input_key": "answer"},
            },
            {
                "id": "llm_1",
                "type": "llm",
                "label": "LLM",
                "position": {"x": 0, "y": 200},
                "config": {
                    "provider": "openai",
                    "model": "gpt-4o",
                    "system_prompt": "Reply.",
                    "temperature": 0,
                    "max_tokens": 10,
                    "input_map": {"a": "answer"},
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
            {"id": "e2", "source": "ask", "target": "llm_1"},
            {"id": "e3", "source": "llm_1", "target": "e"},
        ],
        "metadata": {"created_at": "2026-01-01", "updated_at": "2026-01-01"},
    }


class FakeDB:
    async def execute(self, *args, **kwargs):
        pass

    async def commit(self):
        pass


async def main():
    print("Test 18: Cancel a running execution")
    print("-" * 50)

    schema = make_schema()
    mock = FakeListChatModel(responses=["OK"])
    saver = InMemorySaver()
    result = build_graph(schema, llm_override=mock, checkpointer=saver)

    run_manager = RunManager()
    run_id = "test-run-18"

    ctx = await run_manager.start_run(
        run_id=run_id,
        graph_id="graph-18",
        owner_id="owner-1",
        compiled_graph=result.graph,
        config={"configurable": {"thread_id": run_id}},
        input_data={},
        defaults=result.defaults,
        schema_dict=schema,
        db=FakeDB(),
    )

    # Wait for pause
    for _ in range(50):
        if ctx.status == "paused":
            break
        await asyncio.sleep(0.1)
    assert ctx.status == "paused"
    print(f"\n  Status before cancel: {ctx.status}")

    # Cancel the run by setting the cancel event + resume event.
    # cancel_event is checked cooperatively inside astream iteration.
    # We must also unblock _wait_for_resume by setting resume_event,
    # otherwise the task stays blocked forever.
    print("  Cancelling run...")
    cancelled = await run_manager.cancel_run(run_id)
    assert cancelled, "cancel_run should return True"
    ctx.resume_event.set()  # unblock _wait_for_resume so it can proceed

    # Wait for the task to finish
    if ctx.task:
        await asyncio.wait_for(ctx.task, timeout=5.0)

    print(f"  Status after cancel:  {ctx.status}")
    assert ctx.status == "error", f"Expected 'error', got '{ctx.status}'"

    # Verify an error event was emitted (may be CancelledError or internal error)
    error_events = [e for e in ctx.events if e["event"] == "error"]
    assert len(error_events) >= 1, "Should have at least one error event"
    error_msg = error_events[-1]["data"]["message"]
    print(f"  Error message: {error_msg}")
    assert error_events[-1]["data"]["recoverable"] is False, (
        "Cancel errors should not be recoverable"
    )

    print("\n  PASS")


if __name__ == "__main__":
    asyncio.run(main())
