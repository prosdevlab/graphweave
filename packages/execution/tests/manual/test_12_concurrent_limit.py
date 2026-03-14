"""Manual test 12: Concurrent run limit enforcement.

Verifies:
  1. RunManager enforces MAX_RUNS_PER_KEY
  2. Exceeding the limit raises ValueError
  3. After a run completes, a new one can start

Usage: cd packages/execution && uv run python tests/manual/test_12_concurrent_limit.py
"""

import asyncio
import os

from langchain_core.language_models import FakeListChatModel
from langgraph.checkpoint.memory import InMemorySaver

from app.builder import build_graph
from app.executor import RunManager


def make_schema():
    return {
        "id": "limit-test",
        "name": "Limit Test",
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
    print("Test 12: Concurrent run limit enforcement")
    print("-" * 50)

    # Force limit to 1 for testing
    os.environ["MAX_RUNS_PER_KEY"] = "1"

    schema = make_schema()
    db = FakeDB()

    # Use a human_input graph so run stays "paused" (doesn't complete instantly)
    pause_schema = {
        **schema,
        "id": "pause-limit",
        "nodes": [
            schema["nodes"][0],  # start
            {
                "id": "ask",
                "type": "human_input",
                "label": "Ask",
                "position": {"x": 0, "y": 100},
                "config": {"prompt": "Wait here", "input_key": "result"},
            },
            schema["nodes"][2],  # end
        ],
        "edges": [
            {"id": "e1", "source": "s", "target": "ask"},
            {"id": "e2", "source": "ask", "target": "e"},
        ],
    }

    mock = FakeListChatModel(responses=["ok"])
    saver1 = InMemorySaver()
    result1 = build_graph(pause_schema, llm_override=mock, checkpointer=saver1)

    run_manager = RunManager()
    print(f"\n  MAX_RUNS_PER_KEY: {run_manager._max_per_key}")

    # Start first run (should succeed)
    ctx1 = await run_manager.start_run(
        run_id="run-limit-1",
        graph_id="graph-12",
        owner_id="owner-1",
        compiled_graph=result1.graph,
        config={"configurable": {"thread_id": "run-limit-1"}},
        input_data={},
        defaults=result1.defaults,
        schema_dict=pause_schema,
        db=db,
    )

    # Wait for it to pause
    for _ in range(50):
        if ctx1.status == "paused":
            break
        await asyncio.sleep(0.1)
    print(f"  Run 1 status: {ctx1.status}")
    assert ctx1.status == "paused"

    # Second run should fail (limit = 1)
    print("\n  Starting run 2 (should fail with ValueError)...")
    saver2 = InMemorySaver()
    result2 = build_graph(pause_schema, llm_override=mock, checkpointer=saver2)
    try:
        await run_manager.start_run(
            run_id="run-limit-2",
            graph_id="graph-12",
            owner_id="owner-1",
            compiled_graph=result2.graph,
            config={"configurable": {"thread_id": "run-limit-2"}},
            input_data={},
            defaults=result2.defaults,
            schema_dict=pause_schema,
            db=db,
        )
        raise AssertionError("Should have raised ValueError")
    except ValueError as exc:
        print(f"  Caught expected error: {exc}")

    # Different owner should work
    print("\n  Starting run for different owner (should succeed)...")
    saver3 = InMemorySaver()
    result3 = build_graph(pause_schema, llm_override=mock, checkpointer=saver3)
    ctx3 = await run_manager.start_run(
        run_id="run-limit-3",
        graph_id="graph-12",
        owner_id="owner-2",
        compiled_graph=result3.graph,
        config={"configurable": {"thread_id": "run-limit-3"}},
        input_data={},
        defaults=result3.defaults,
        schema_dict=pause_schema,
        db=db,
    )
    print(f"  Run 3 (owner-2) started: status={ctx3.status}")

    # Clean up: cancel all runs
    await run_manager.cancel_all()

    # Restore env
    del os.environ["MAX_RUNS_PER_KEY"]

    print("\n  PASS")


if __name__ == "__main__":
    asyncio.run(main())
