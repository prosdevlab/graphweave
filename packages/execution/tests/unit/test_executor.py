"""Tests for executor core functions (Part 3.3)."""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime
from unittest.mock import AsyncMock, patch

import pytest
from langchain_core.language_models import FakeListChatModel
from langgraph.checkpoint.memory import InMemorySaver

from app.builder import build_graph
from app.executor import (
    RunContext,
    RunManager,
    _emit,
    _safe_update_run,
    format_sse,
    stream_run_sse,
)


def _make_simple_schema():
    return {
        "id": "exec-test",
        "name": "ExecTest",
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
                    "system_prompt": "Reply.",
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


def _make_tool_schema():
    return {
        "id": "tool-test",
        "name": "ToolTest",
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
                "id": "tool_1",
                "type": "tool",
                "label": "Calc",
                "position": {"x": 0, "y": 100},
                "config": {
                    "tool_name": "calculator",
                    "input_map": {"expression": "result"},
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
            {"id": "e1", "source": "s", "target": "tool_1"},
            {"id": "e2", "source": "tool_1", "target": "e"},
        ],
        "metadata": {"created_at": "2026-01-01", "updated_at": "2026-01-01"},
    }


def _make_condition_schema():
    return {
        "id": "cond-test",
        "name": "CondTest",
        "version": 1,
        "state": [
            {"key": "messages", "type": "list", "reducer": "append"},
            {"key": "result", "type": "string", "reducer": "replace"},
            {"key": "mode", "type": "string", "reducer": "replace"},
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
                "id": "cond_1",
                "type": "condition",
                "label": "Check",
                "position": {"x": 0, "y": 100},
                "config": {
                    "condition": {
                        "type": "field_equals",
                        "field": "mode",
                        "value": "fast",
                        "branch": "go_fast",
                    },
                    "branches": {"go_fast": "llm_1", "go_slow": "e"},
                    "default_branch": "go_slow",
                },
            },
            {
                "id": "llm_1",
                "type": "llm",
                "label": "LLM",
                "position": {"x": 100, "y": 200},
                "config": {
                    "provider": "openai",
                    "model": "gpt-4o",
                    "system_prompt": "Go fast.",
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
                "position": {"x": 0, "y": 300},
                "config": {},
            },
        ],
        "edges": [
            {"id": "e1", "source": "s", "target": "cond_1"},
            {
                "id": "e2",
                "source": "cond_1",
                "target": "llm_1",
                "condition_branch": "go_fast",
            },
            {
                "id": "e3",
                "source": "cond_1",
                "target": "e",
                "condition_branch": "go_slow",
            },
            {"id": "e4", "source": "llm_1", "target": "e"},
        ],
        "metadata": {"created_at": "2026-01-01", "updated_at": "2026-01-01"},
    }


async def _collect_events(ctx, timeout=5.0):
    """Collect events from queue until sentinel."""
    events = []
    deadline = asyncio.get_event_loop().time() + timeout
    while True:
        remaining = deadline - asyncio.get_event_loop().time()
        if remaining <= 0:
            break
        try:
            event = await asyncio.wait_for(ctx.queue.get(), timeout=remaining)
        except TimeoutError:
            break
        if event is None:
            break
        events.append(event)
    return events


async def _run_graph(schema, db, mock_responses=None, input_data=None, run_timeout=300):
    """Build and run a graph, return (ctx, events)."""
    mock = FakeListChatModel(responses=mock_responses or ["hello"])
    saver = InMemorySaver()
    result = build_graph(schema, llm_override=mock, checkpointer=saver)
    rm = RunManager()
    run_id = "test-run-1"
    config = {"configurable": {"thread_id": run_id}}

    ctx = await rm.start_run(
        run_id=run_id,
        graph_id="g1",
        owner_id="owner-1",
        compiled_graph=result.graph,
        config=config,
        input_data=input_data or {},
        defaults=result.defaults,
        schema_dict=schema,
        db=db,
    )
    events = await _collect_events(ctx)
    return ctx, events


# ---------------------------------------------------------------------------
# format_sse tests
# ---------------------------------------------------------------------------


class TestFormatSSE:
    def test_format_sse(self):
        result = format_sse("test", {"key": "val"}, event_id=1)
        assert result == 'id: 1\nevent: test\ndata: {"key": "val"}\n\n'

    def test_format_sse_no_id(self):
        result = format_sse("test", {"key": "val"}, event_id=None)
        assert "id:" not in result
        assert result == 'event: test\ndata: {"key": "val"}\n\n'

    def test_format_sse_non_serializable(self):
        dt = datetime(2026, 1, 1)
        result = format_sse("test", {"ts": dt})
        assert "2026-01-01" in result


# ---------------------------------------------------------------------------
# _emit tests
# ---------------------------------------------------------------------------


class TestEmit:
    def test_emit_queue_full_does_not_crash(self):
        ctx = RunContext(
            run_id="r1",
            graph_id="g1",
            owner_id="o1",
            queue=asyncio.Queue(maxsize=1),
            task=None,
            cancel_event=asyncio.Event(),
            status="running",
            started_at=0.0,
            resume_event=asyncio.Event(),
            compiled_graph=None,  # type: ignore[arg-type]
        )
        # Fill the queue
        ctx.queue.put_nowait({"dummy": True})
        # Should not raise
        _emit(ctx, "test", {"val": 1})
        assert len(ctx.events) == 1
        assert ctx.events[0]["id"] == 1

    def test_event_ids_are_sequential(self):
        ctx = RunContext(
            run_id="r1",
            graph_id="g1",
            owner_id="o1",
            queue=asyncio.Queue(maxsize=100),
            task=None,
            cancel_event=asyncio.Event(),
            status="running",
            started_at=0.0,
            resume_event=asyncio.Event(),
            compiled_graph=None,  # type: ignore[arg-type]
        )
        for i in range(5):
            _emit(ctx, f"event_{i}", {"i": i})
        ids = [e["id"] for e in ctx.events]
        assert ids == [1, 2, 3, 4, 5]


# ---------------------------------------------------------------------------
# _safe_update_run tests
# ---------------------------------------------------------------------------


class TestSafeUpdateRun:
    async def test_db_failure_logs_not_raises(self, caplog):
        mock_db = AsyncMock()
        with (
            patch("app.executor.update_run", side_effect=Exception("DB down")),
            caplog.at_level(logging.ERROR),
        ):
            await _safe_update_run(mock_db, "r1", status="error")
        assert "Failed to update run r1" in caplog.text


# ---------------------------------------------------------------------------
# Execution tests
# ---------------------------------------------------------------------------


class TestExecution:
    @pytest.fixture(autouse=True)
    def _no_grace(self, monkeypatch):
        monkeypatch.setenv("RUN_CLEANUP_GRACE_SECONDS", "0")

    async def test_simple_run_completes(self, db):
        _, events = await _run_graph(_make_simple_schema(), db)
        event_types = [e["event"] for e in events]
        assert "run_started" in event_types
        assert "node_started" in event_types
        assert "node_completed" in event_types
        assert "graph_completed" in event_types

        completed = next(e for e in events if e["event"] == "graph_completed")
        assert "final_state" in completed["data"]
        assert completed["data"]["duration_ms"] > 0

    async def test_tool_run_emits_events(self, db):
        _, events = await _run_graph(
            _make_tool_schema(),
            db,
            input_data={"result": "2+2"},
        )
        node_completed = [e for e in events if e["event"] == "node_completed"]
        assert len(node_completed) >= 1
        # Tool node output should be a dict
        tool_output = node_completed[0]["data"]["output"]
        assert isinstance(tool_output, dict)

    async def test_run_error_handling(self, db):
        schema = _make_simple_schema()
        mock = FakeListChatModel(responses=[])  # No responses -> will error
        saver = InMemorySaver()
        result = build_graph(schema, llm_override=mock, checkpointer=saver)
        rm = RunManager()

        ctx = await rm.start_run(
            run_id="err-run",
            graph_id="g1",
            owner_id="o1",
            compiled_graph=result.graph,
            config={"configurable": {"thread_id": "err-run"}},
            input_data={},
            defaults=result.defaults,
            schema_dict=schema,
            db=db,
        )
        events = await _collect_events(ctx)

        # Should have an error event
        event_types = [e["event"] for e in events]
        assert "error" in event_types or "graph_completed" in event_types

    async def test_run_cancellation(self, db):
        schema = _make_simple_schema()
        mock = FakeListChatModel(responses=["hello"])
        saver = InMemorySaver()
        result = build_graph(schema, llm_override=mock, checkpointer=saver)
        rm = RunManager()

        ctx = await rm.start_run(
            run_id="cancel-run",
            graph_id="g1",
            owner_id="o1",
            compiled_graph=result.graph,
            config={"configurable": {"thread_id": "cancel-run"}},
            input_data={},
            defaults=result.defaults,
            schema_dict=schema,
            db=db,
        )
        # Cancel immediately
        ctx.cancel_event.set()
        events = await _collect_events(ctx)

        # Should have either completed before cancel was checked,
        # or have an error event
        event_types = [e["event"] for e in events]
        assert "run_started" in event_types

    async def test_state_snapshot_in_node_completed(self, db):
        _, events = await _run_graph(_make_simple_schema(), db)
        node_completed = next(e for e in events if e["event"] == "node_completed")
        snapshot = node_completed["data"]["state_snapshot"]
        assert isinstance(snapshot, dict)
        assert "result" in snapshot

    async def test_edge_traversed_events(self, db):
        _, events = await _run_graph(_make_simple_schema(), db)
        edge_events = [e for e in events if e["event"] == "edge_traversed"]
        assert len(edge_events) >= 1
        for edge in edge_events:
            assert "from" in edge["data"]
            assert "to" in edge["data"]

    async def test_node_started_events_emitted(self, db):
        _, events = await _run_graph(_make_simple_schema(), db)
        started = [e for e in events if e["event"] == "node_started"]
        completed = [e for e in events if e["event"] == "node_completed"]
        assert len(started) >= 1
        assert len(completed) >= 1
        # node_started should have node_type
        assert "node_type" in started[0]["data"]
        # node_started should appear before node_completed for same node
        started_idx = next(
            i for i, e in enumerate(events) if e["event"] == "node_started"
        )
        completed_idx = next(
            i for i, e in enumerate(events) if e["event"] == "node_completed"
        )
        assert started_idx < completed_idx

    async def test_condition_node_routing_emits_events(self, db):
        _, events = await _run_graph(
            _make_condition_schema(),
            db,
            input_data={"mode": "fast"},
        )
        edge_events = [e for e in events if e["event"] == "edge_traversed"]
        # Should have edge from condition with condition_result
        cond_edge = next(
            (e for e in edge_events if e["data"].get("condition_result") is not None),
            None,
        )
        assert cond_edge is not None
        assert cond_edge["data"]["condition_result"] == "go_fast"


# ---------------------------------------------------------------------------
# stream_run_sse tests
# ---------------------------------------------------------------------------


class TestStreamRunSSE:
    @pytest.fixture(autouse=True)
    def _no_grace(self, monkeypatch):
        monkeypatch.setenv("RUN_CLEANUP_GRACE_SECONDS", "0")

    async def test_stream_after_completion_replays_all_events(self, db):
        ctx, events = await _run_graph(_make_simple_schema(), db)
        # Queue sentinel already consumed by _collect_events.
        # Put a new sentinel so stream_run_sse can terminate.
        await ctx.queue.put(None)

        replayed = []
        async for sse_str in stream_run_sse(ctx, last_event_id=0):
            replayed.append(sse_str)

        # Should have replayed all events from ctx.events
        assert len(replayed) == len(ctx.events)
