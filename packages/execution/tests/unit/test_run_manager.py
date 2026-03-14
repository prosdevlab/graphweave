"""Tests for RunManager and RunContext (Part 3.2)."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest
from langchain_core.language_models import FakeListChatModel
from langgraph.checkpoint.memory import InMemorySaver

from app.builder import build_graph
from app.executor import RunManager


def _make_simple_schema():
    return {
        "id": "rm-test",
        "name": "RMTest",
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


async def _start_test_run(rm, owner_id="owner-1", run_id=None, db=None):
    """Helper to start a run with mocked _execute_run."""
    schema = _make_simple_schema()
    mock_llm = FakeListChatModel(responses=["hello"])
    saver = InMemorySaver()
    result = build_graph(schema, llm_override=mock_llm, checkpointer=saver)
    rid = run_id or f"run-{id(rm)}-{rm.active_count_global()}"
    config = {"configurable": {"thread_id": rid}}

    with patch("app.executor._execute_run", new_callable=AsyncMock):
        ctx = await rm.start_run(
            run_id=rid,
            graph_id="g1",
            owner_id=owner_id,
            compiled_graph=result.graph,
            config=config,
            input_data={},
            defaults=result.defaults,
            schema_dict=schema,
            db=db,
        )
    return ctx


class TestRunManagerConcurrentLimits:
    @pytest.fixture(autouse=True)
    def _set_env(self, monkeypatch):
        monkeypatch.setenv("MAX_RUNS_PER_KEY", "2")
        monkeypatch.setenv("MAX_RUNS_GLOBAL", "10")

    async def test_concurrent_limit_per_key(self):
        rm = RunManager()
        await _start_test_run(rm, owner_id="owner-a", run_id="r1")
        await _start_test_run(rm, owner_id="owner-a", run_id="r2")
        with pytest.raises(ValueError, match="Concurrent run limit"):
            await _start_test_run(rm, owner_id="owner-a", run_id="r3")

    async def test_concurrent_limit_global(self, monkeypatch):
        monkeypatch.setenv("MAX_RUNS_GLOBAL", "2")
        rm = RunManager()
        await _start_test_run(rm, owner_id="owner-a", run_id="r1")
        await _start_test_run(rm, owner_id="owner-b", run_id="r2")
        with pytest.raises(ValueError, match="Global concurrent"):
            await _start_test_run(rm, owner_id="owner-c", run_id="r3")

    async def test_concurrent_limit_boundary(self):
        rm = RunManager()
        ctx1 = await _start_test_run(rm, owner_id="owner-a", run_id="r1")
        ctx2 = await _start_test_run(rm, owner_id="owner-a", run_id="r2")
        assert ctx1 is not None
        assert ctx2 is not None
        with pytest.raises(ValueError):
            await _start_test_run(rm, owner_id="owner-a", run_id="r3")


class TestRunManagerOperations:
    async def test_get_run_not_found(self):
        rm = RunManager()
        assert rm.get_run("nonexistent") is None

    async def test_cancel_run(self):
        rm = RunManager()
        ctx = await _start_test_run(rm, run_id="r1")
        result = await rm.cancel_run("r1")
        assert result is True
        assert ctx.cancel_event.is_set()

    async def test_cleanup_after_completion(self):
        rm = RunManager()
        ctx = await _start_test_run(rm, run_id="r1")
        assert rm.get_run("r1") is ctx
        rm.cleanup_run("r1")
        assert rm.get_run("r1") is None
        # Idempotent
        rm.cleanup_run("r1")

    async def test_submit_resume_sets_value_and_event(self):
        rm = RunManager()
        ctx = await _start_test_run(rm, run_id="r1")
        ctx.status = "paused"
        result = await rm.submit_resume("r1", "user input")
        assert result is True
        assert ctx.resume_value == "user input"
        assert ctx.resume_event.is_set()

    async def test_submit_resume_not_paused_returns_false(self):
        rm = RunManager()
        ctx = await _start_test_run(rm, run_id="r1")
        assert ctx.status == "running"
        result = await rm.submit_resume("r1", "value")
        assert result is False
        assert not ctx.resume_event.is_set()
