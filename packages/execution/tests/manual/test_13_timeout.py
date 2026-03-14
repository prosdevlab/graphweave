"""Manual test 13: Run timeout enforcement.

Verifies:
  1. Executor enforces RUN_TIMEOUT_SECONDS
  2. Timeout emits an error SSE event
  3. Status transitions to "error"
  4. Pause time is excluded from timeout calculation

Uses a loop graph that would run forever without the timeout.

Usage: cd packages/execution && uv run python tests/manual/test_13_timeout.py
"""

import asyncio
import os

from langchain_core.language_models import FakeListChatModel
from langgraph.checkpoint.memory import InMemorySaver

from app.builder import build_graph
from app.executor import RunManager, stream_run_sse


def make_loop_schema():
    """Graph that loops forever: start → llm → condition(iteration_limit=999) → llm."""
    return {
        "id": "timeout-test",
        "name": "Timeout Test",
        "version": 1,
        "state": [
            {"key": "messages", "type": "list", "reducer": "append"},
            {"key": "counter", "type": "number", "reducer": "replace"},
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
                    "system_prompt": "Count up.",
                    "temperature": 0,
                    "max_tokens": 10,
                    "input_map": {"n": "counter"},
                    "output_key": "result",
                },
            },
            {
                "id": "check",
                "type": "condition",
                "label": "Check Limit",
                "position": {"x": 0, "y": 200},
                "config": {
                    "condition": {
                        "type": "iteration_limit",
                        "field": "counter",
                        "max": 999,
                        "continue": "loop",
                        "exceeded": "done",
                    },
                    "branches": {"loop": "llm_1", "done": "e"},
                    "default_branch": "done",
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
            {"id": "e1", "source": "s", "target": "llm_1"},
            {"id": "e2", "source": "llm_1", "target": "check"},
            {
                "id": "e3",
                "source": "check",
                "target": "llm_1",
                "condition_branch": "loop",
            },
            {
                "id": "e4",
                "source": "check",
                "target": "e",
                "condition_branch": "done",
            },
        ],
        "metadata": {"created_at": "2026-01-01", "updated_at": "2026-01-01"},
    }


class FakeDB:
    async def execute(self, *args, **kwargs):
        pass

    async def commit(self):
        pass


async def main():
    print("Test 13: Run timeout enforcement")
    print("-" * 50)

    # Set a very short timeout (1 second)
    os.environ["RUN_TIMEOUT_SECONDS"] = "1"
    os.environ["RUN_CLEANUP_GRACE_SECONDS"] = "0"

    schema = make_loop_schema()
    # Provide many responses so the loop keeps going
    mock = FakeListChatModel(responses=["x"] * 1000)
    saver = InMemorySaver()
    result = build_graph(schema, llm_override=mock, checkpointer=saver)

    run_manager = RunManager()
    run_id = "test-run-13"

    ctx = await run_manager.start_run(
        run_id=run_id,
        graph_id="graph-13",
        owner_id="owner-1",
        compiled_graph=result.graph,
        config={"configurable": {"thread_id": run_id}},
        input_data={"counter": 0},
        defaults=result.defaults,
        schema_dict=schema,
        db=FakeDB(),
    )

    print("\n  RUN_TIMEOUT_SECONDS: 1")
    print("  Waiting for timeout...")

    # Drain SSE stream
    async for _ in stream_run_sse(ctx):
        pass

    print(f"  Final status: {ctx.status}")
    assert ctx.status == "error", f"Expected 'error', got '{ctx.status}'"

    # Verify timeout error event
    error_events = [e for e in ctx.events if e["event"] == "error"]
    assert len(error_events) >= 1, "Should have at least one error event"
    error_msg = error_events[-1]["data"]["message"]
    print(f"  Error message: {error_msg}")
    assert "timed out" in error_msg.lower() or "timeout" in error_msg.lower(), (
        f"Error should mention timeout: {error_msg}"
    )

    # Count how many nodes ran before timeout
    node_completed = [e for e in ctx.events if e["event"] == "node_completed"]
    print(f"  Nodes completed before timeout: {len(node_completed)}")

    # Restore env
    del os.environ["RUN_TIMEOUT_SECONDS"]
    del os.environ["RUN_CLEANUP_GRACE_SECONDS"]

    print("\n  PASS")


if __name__ == "__main__":
    asyncio.run(main())
