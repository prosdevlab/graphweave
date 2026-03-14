"""Tests for human-in-the-loop executor flows (Part 3.3)."""

from __future__ import annotations

import asyncio

import pytest
from langchain_core.language_models import FakeListChatModel
from langgraph.checkpoint.memory import InMemorySaver

from app.builder import build_graph
from app.executor import RunManager


def _make_human_schema():
    return {
        "id": "human-test",
        "name": "HumanTest",
        "version": 1,
        "state": [
            {"key": "messages", "type": "list", "reducer": "append"},
            {"key": "result", "type": "string", "reducer": "replace"},
            {"key": "user_answer", "type": "string", "reducer": "replace"},
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
                "id": "human_1",
                "type": "human_input",
                "label": "Ask",
                "position": {"x": 0, "y": 100},
                "config": {"prompt": "What is your name?", "input_key": "user_answer"},
            },
            {
                "id": "llm_1",
                "type": "llm",
                "label": "Reply",
                "position": {"x": 0, "y": 200},
                "config": {
                    "provider": "openai",
                    "model": "gpt-4o",
                    "system_prompt": "Greet the user.",
                    "temperature": 0.7,
                    "max_tokens": 100,
                    "input_map": {"name": "user_answer"},
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
            {"id": "e1", "source": "s", "target": "human_1"},
            {"id": "e2", "source": "human_1", "target": "llm_1"},
            {"id": "e3", "source": "llm_1", "target": "e"},
        ],
        "metadata": {"created_at": "2026-01-01", "updated_at": "2026-01-01"},
    }


def _make_double_human_schema():
    return {
        "id": "double-human",
        "name": "DoubleHuman",
        "version": 1,
        "state": [
            {"key": "messages", "type": "list", "reducer": "append"},
            {"key": "result", "type": "string", "reducer": "replace"},
            {"key": "first_answer", "type": "string", "reducer": "replace"},
            {"key": "second_answer", "type": "string", "reducer": "replace"},
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
                "id": "human_1",
                "type": "human_input",
                "label": "Ask1",
                "position": {"x": 0, "y": 100},
                "config": {"prompt": "First question?", "input_key": "first_answer"},
            },
            {
                "id": "llm_1",
                "type": "llm",
                "label": "Process",
                "position": {"x": 0, "y": 200},
                "config": {
                    "provider": "openai",
                    "model": "gpt-4o",
                    "system_prompt": "Process.",
                    "temperature": 0.7,
                    "max_tokens": 100,
                    "input_map": {},
                    "output_key": "result",
                },
            },
            {
                "id": "human_2",
                "type": "human_input",
                "label": "Ask2",
                "position": {"x": 0, "y": 300},
                "config": {"prompt": "Second question?", "input_key": "second_answer"},
            },
            {
                "id": "e",
                "type": "end",
                "label": "End",
                "position": {"x": 0, "y": 400},
                "config": {},
            },
        ],
        "edges": [
            {"id": "e1", "source": "s", "target": "human_1"},
            {"id": "e2", "source": "human_1", "target": "llm_1"},
            {"id": "e3", "source": "llm_1", "target": "human_2"},
            {"id": "e4", "source": "human_2", "target": "e"},
        ],
        "metadata": {"created_at": "2026-01-01", "updated_at": "2026-01-01"},
    }


async def _wait_for_status(ctx, status, timeout=5.0):
    """Wait until ctx.status matches."""
    deadline = asyncio.get_event_loop().time() + timeout
    while ctx.status != status:
        remaining = deadline - asyncio.get_event_loop().time()
        if remaining <= 0:
            pytest.fail(f"Timed out waiting for status={status}, got {ctx.status}")
        await asyncio.sleep(0.05)


async def _start_human_run(schema, db, mock_responses=None):
    mock = FakeListChatModel(responses=mock_responses or ["Hello!"])
    saver = InMemorySaver()
    result = build_graph(schema, llm_override=mock, checkpointer=saver)
    rm = RunManager()
    run_id = "human-run-1"
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
    return rm, ctx


class TestHumanInput:
    @pytest.fixture(autouse=True)
    def _no_grace(self, monkeypatch):
        monkeypatch.setenv("RUN_CLEANUP_GRACE_SECONDS", "0")

    async def test_pause_emits_graph_paused(self, db):
        _, ctx = await _start_human_run(_make_human_schema(), db)
        await _wait_for_status(ctx, "paused")

        paused_events = [e for e in ctx.events if e["event"] == "graph_paused"]
        assert len(paused_events) == 1
        data = paused_events[0]["data"]
        assert data["prompt"] == "What is your name?"
        assert data["run_id"] == "human-run-1"
        assert "input_key" in data
        assert paused_events[0]["id"] is not None  # has sequential ID

    async def test_resume_continues_execution(self, db):
        rm, ctx = await _start_human_run(_make_human_schema(), db)
        await _wait_for_status(ctx, "paused")

        result = await rm.submit_resume("human-run-1", "Alice")
        assert result is True

        await _wait_for_status(ctx, "completed", timeout=10.0)
        event_types = [e["event"] for e in ctx.events]
        assert "graph_completed" in event_types

    async def test_resume_with_dict_input(self, db):
        rm, ctx = await _start_human_run(_make_human_schema(), db)
        await _wait_for_status(ctx, "paused")

        result = await rm.submit_resume("human-run-1", {"answer": "yes"})
        assert result is True

        await _wait_for_status(ctx, "completed", timeout=10.0)

    async def test_double_pause_resume(self, db):
        rm, ctx = await _start_human_run(
            _make_double_human_schema(), db, mock_responses=["processed"]
        )
        # First pause
        await _wait_for_status(ctx, "paused")
        paused_1 = [e for e in ctx.events if e["event"] == "graph_paused"]
        assert len(paused_1) == 1

        first_pause_count = len([e for e in ctx.events if e["event"] == "graph_paused"])
        await rm.submit_resume("human-run-1", "first answer")

        # Wait until we see a second graph_paused event
        deadline = asyncio.get_event_loop().time() + 10.0
        while True:
            pauses = [e for e in ctx.events if e["event"] == "graph_paused"]
            current_pauses = len(pauses)
            if current_pauses > first_pause_count:
                break
            if asyncio.get_event_loop().time() > deadline:
                pytest.fail("Timed out waiting for second pause")
            await asyncio.sleep(0.05)

        paused_2 = [e for e in ctx.events if e["event"] == "graph_paused"]
        assert len(paused_2) == 2  # Two pause events total

        await rm.submit_resume("human-run-1", "second answer")
        await _wait_for_status(ctx, "completed", timeout=10.0)

        event_types = [e["event"] for e in ctx.events]
        assert "graph_completed" in event_types
