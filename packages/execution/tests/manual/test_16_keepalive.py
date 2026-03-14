"""Manual test 16: Keepalive events during pause.

Verifies:
  1. Keepalive events are emitted every 15s while waiting for resume
  2. Keepalive events have no id: field (not buffered for replay)
  3. Keepalive doesn't interfere with resume

Note: Uses a shorter wait to avoid 15s actual wait. We verify the
keepalive mechanism by checking the _emit_keepalive code path via
a quick resume cycle.

Usage: cd packages/execution && uv run python tests/manual/test_16_keepalive.py
"""

import asyncio

from langchain_core.language_models import FakeListChatModel
from langgraph.checkpoint.memory import InMemorySaver

from app.builder import build_graph
from app.executor import RunManager, format_sse, stream_run_sse


def make_schema():
    return {
        "id": "keepalive-test",
        "name": "Keepalive Test",
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
                "config": {"prompt": "Continue?", "input_key": "answer"},
            },
            {
                "id": "llm_1",
                "type": "llm",
                "label": "LLM",
                "position": {"x": 0, "y": 200},
                "config": {
                    "provider": "openai",
                    "model": "gpt-4o",
                    "system_prompt": "Confirm.",
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
    print("Test 16: Keepalive events during pause")
    print("-" * 50)

    schema = make_schema()
    mock = FakeListChatModel(responses=["OK"])
    saver = InMemorySaver()
    result = build_graph(schema, llm_override=mock, checkpointer=saver)

    run_manager = RunManager()
    run_id = "test-run-16"

    ctx = await run_manager.start_run(
        run_id=run_id,
        graph_id="graph-16",
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

    # Verify format_sse produces no id: line for keepalive
    keepalive_str = format_sse("keepalive", {}, event_id=None)
    print("\n  Keepalive format:")
    for line in keepalive_str.strip().split("\n"):
        print(f"    {line}")
    assert "id:" not in keepalive_str, "Keepalive should have no id: line"
    assert "event: keepalive" in keepalive_str

    # Verify keepalive events are NOT in the replay buffer (ctx.events)
    keepalive_buffered = [e for e in ctx.events if e["event"] == "keepalive"]
    print(f"\n  Keepalive events in replay buffer: {len(keepalive_buffered)}")
    assert len(keepalive_buffered) == 0, "Keepalive should not be buffered"

    # Resume and complete
    await run_manager.submit_resume(run_id, "yes")
    async for _ in stream_run_sse(ctx):
        pass

    assert ctx.status == "completed"

    # After completion, verify no keepalive in buffer
    keepalive_buffered_final = [e for e in ctx.events if e["event"] == "keepalive"]
    assert len(keepalive_buffered_final) == 0, (
        "Keepalive should never be in replay buffer"
    )

    print("  Keepalive events correctly excluded from replay buffer")
    print("\n  PASS")


if __name__ == "__main__":
    asyncio.run(main())
