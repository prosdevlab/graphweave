"""Tests for SSE reconnection and replay (Part 3.3)."""

from __future__ import annotations

import asyncio

import pytest
from langchain_core.language_models import FakeListChatModel
from langgraph.checkpoint.memory import InMemorySaver

from app.builder import build_graph
from app.executor import RunManager, stream_run_sse


def _make_simple_schema():
    return {
        "id": "recon-test",
        "name": "ReconTest",
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
                    "system_prompt": "Hi",
                    "temperature": 0.7,
                    "max_tokens": 100,
                    "input_map": {},
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


async def _run_and_complete(db):
    """Run a graph to completion and return ctx with populated events."""
    schema = _make_simple_schema()
    mock = FakeListChatModel(responses=["hello"])
    saver = InMemorySaver()
    result = build_graph(schema, llm_override=mock, checkpointer=saver)
    rm = RunManager()
    run_id = "recon-run"
    config = {"configurable": {"thread_id": run_id}}

    ctx = await rm.start_run(
        run_id=run_id,
        graph_id="g1",
        owner_id="o1",
        compiled_graph=result.graph,
        config=config,
        input_data={},
        defaults=result.defaults,
        schema_dict=schema,
        db=db,
    )
    # Wait for completion
    deadline = asyncio.get_event_loop().time() + 5.0
    while ctx.status != "completed":
        if asyncio.get_event_loop().time() > deadline:
            pytest.fail("Run did not complete")
        await asyncio.sleep(0.05)

    # Drain the queue sentinel
    while not ctx.queue.empty():
        ctx.queue.get_nowait()

    return ctx


class TestReconnection:
    @pytest.fixture(autouse=True)
    def _no_grace(self, monkeypatch):
        monkeypatch.setenv("RUN_CLEANUP_GRACE_SECONDS", "0")

    async def test_reconnection_replays_from_last_event_id(self, db):
        ctx = await _run_and_complete(db)
        assert len(ctx.events) >= 3  # at least run_started, node_*, graph_completed

        # Skip first 2 events
        second_id = ctx.events[1]["id"]
        await ctx.queue.put(None)  # sentinel for live loop

        replayed = []
        async for sse_str in stream_run_sse(ctx, last_event_id=second_id):
            replayed.append(sse_str)

        # Should have skipped first 2 events
        assert len(replayed) == len(ctx.events) - 2

    async def test_reconnection_replays_all_when_no_id(self, db):
        ctx = await _run_and_complete(db)
        await ctx.queue.put(None)

        replayed = []
        async for sse_str in stream_run_sse(ctx, last_event_id=0):
            replayed.append(sse_str)

        assert len(replayed) == len(ctx.events)

    async def test_keepalive_not_replayed(self, db):
        ctx = await _run_and_complete(db)
        # Manually insert a keepalive event with id=None
        ctx.events.append({"id": None, "event": "keepalive", "data": {}})
        await ctx.queue.put(None)

        replayed = []
        async for sse_str in stream_run_sse(ctx, last_event_id=0):
            replayed.append(sse_str)

        # Keepalive should be skipped (id is None, not > 0)
        assert len(replayed) == len(ctx.events) - 1
        assert all("keepalive" not in s for s in replayed)

    async def test_reconnection_no_duplicate_events(self, db):
        ctx = await _run_and_complete(db)

        # Put events back on queue to simulate overlap
        for event_dict in ctx.events:
            try:
                ctx.queue.put_nowait(event_dict)
            except asyncio.QueueFull:
                break
        await ctx.queue.put(None)

        replayed = []
        async for sse_str in stream_run_sse(ctx, last_event_id=0):
            replayed.append(sse_str)

        # Should have exactly len(ctx.events) — no duplicates
        assert len(replayed) == len(ctx.events)

        # Parse event IDs and verify no duplicates
        ids = []
        for s in replayed:
            for line in s.split("\n"):
                if line.startswith("id: "):
                    ids.append(int(line[4:]))
        assert len(ids) == len(set(ids)), f"Duplicate IDs found: {ids}"

    async def test_stream_after_completion_replays_all(self, db):
        ctx = await _run_and_complete(db)
        # Queue sentinel already consumed. Put new one.
        await ctx.queue.put(None)

        replayed = []
        async for sse_str in stream_run_sse(ctx, last_event_id=0):
            replayed.append(sse_str)

        assert len(replayed) == len(ctx.events)
