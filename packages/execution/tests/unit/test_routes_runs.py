"""Integration tests for run routes (Part 3.4)."""

from __future__ import annotations

import asyncio
import uuid

import aiosqlite
import httpx
import pytest

from app.auth import SCOPES_DEFAULT
from app.db.migrations.runner import run_migrations
from app.executor import RunManager
from app.main import app
from tests.conftest import create_test_key


def _simple_schema():
    """Tool-only schema — no LLM, no API keys needed."""
    return {
        "id": "route-test",
        "name": "RouteTest",
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


def _invalid_schema():
    """Schema missing start node — will fail build_graph validation."""
    return {
        "id": "bad",
        "name": "Bad",
        "version": 1,
        "state": [{"key": "x", "type": "string", "reducer": "replace"}],
        "nodes": [
            {
                "id": "e",
                "type": "end",
                "label": "End",
                "position": {"x": 0, "y": 0},
                "config": {},
            },
        ],
        "edges": [],
        "metadata": {"created_at": "2026-01-01", "updated_at": "2026-01-01"},
    }


@pytest.fixture(autouse=True)
def _env(monkeypatch):
    monkeypatch.setenv("RUN_CLEANUP_GRACE_SECONDS", "0")
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test-dummy-key")


@pytest.fixture
async def client(tmp_path):
    db_path = str(tmp_path / "test.db")
    run_migrations(db_path)
    db = await aiosqlite.connect(db_path)
    db.row_factory = aiosqlite.Row
    app.state.db = db
    app.state.run_manager = RunManager()
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    await db.close()


@pytest.fixture
async def api_key(client):
    db = app.state.db
    key, raw = await create_test_key(db, scopes=SCOPES_DEFAULT, name="user")
    return key, raw


@pytest.fixture
async def api_key_b(client):
    db = app.state.db
    key, raw = await create_test_key(db, scopes=SCOPES_DEFAULT, name="user-b")
    return key, raw


def _headers(raw_key: str) -> dict:
    return {"X-API-Key": raw_key}


async def _create_graph(client, raw_key, schema=None):
    resp = await client.post(
        "/v1/graphs",
        json={"name": "test-graph", "schema_json": schema or _simple_schema()},
        headers=_headers(raw_key),
    )
    assert resp.status_code == 201
    return resp.json()["id"]


async def _start_run(client, graph_id, raw_key, input_data=None):
    resp = await client.post(
        f"/v1/graphs/{graph_id}/run",
        json={"input": input_data if input_data is not None else {"result": "2+2"}},
        headers=_headers(raw_key),
    )
    return resp


# ── Start run tests ────────────────────────────────────────────────────


async def test_start_run_returns_202(client, api_key):
    _, raw = api_key
    graph_id = await _create_graph(client, raw)
    resp = await _start_run(client, graph_id, raw, input_data={"result": "2+2"})
    assert resp.status_code == 202
    data = resp.json()
    assert "run_id" in data
    assert data["status"] == "running"


async def test_start_run_graph_not_found(client, api_key):
    _, raw = api_key
    resp = await _start_run(client, "nonexistent-id", raw)
    assert resp.status_code == 404


async def test_start_run_wrong_owner(client, api_key, api_key_b):
    _, raw_a = api_key
    _, raw_b = api_key_b
    graph_id = await _create_graph(client, raw_a)
    resp = await _start_run(client, graph_id, raw_b)
    assert resp.status_code == 404


async def test_start_run_invalid_scope(client):
    db = app.state.db
    _, raw = await create_test_key(db, scopes=["graphs:read"], name="readonly")
    graph_id = await _create_graph(
        client, (await create_test_key(db, name="creator"))[1]
    )
    resp = await _start_run(client, graph_id, raw)
    assert resp.status_code == 403


async def test_start_run_invalid_schema_returns_422(client, api_key):
    _, raw = api_key
    graph_id = await _create_graph(client, raw, schema=_invalid_schema())
    resp = await _start_run(client, graph_id, raw)
    assert resp.status_code == 422


async def test_start_run_concurrent_limit_returns_429(client, api_key, monkeypatch):
    # Set limit to 0 so the very first run triggers 429
    monkeypatch.setenv("MAX_RUNS_PER_KEY", "0")
    app.state.run_manager = RunManager()
    _, raw = api_key
    graph_id = await _create_graph(client, raw)
    resp = await _start_run(client, graph_id, raw)
    assert resp.status_code == 429


# ── Status tests ───────────────────────────────────────────────────────


async def test_run_status_running(client, api_key):
    _, raw = api_key
    graph_id = await _create_graph(client, raw)
    run_resp = await _start_run(client, graph_id, raw, input_data={"result": "1+1"})
    run_id = run_resp.json()["run_id"]
    status_resp = await client.get(f"/v1/runs/{run_id}/status", headers=_headers(raw))
    assert status_resp.status_code == 200
    assert status_resp.json()["status"] in ("running", "completed")


async def test_run_status_completed(client, api_key):
    _, raw = api_key
    graph_id = await _create_graph(client, raw)
    run_resp = await _start_run(client, graph_id, raw)
    run_id = run_resp.json()["run_id"]
    # Wait for completion
    for _ in range(50):
        await asyncio.sleep(0.1)
        status_resp = await client.get(
            f"/v1/runs/{run_id}/status", headers=_headers(raw)
        )
        if status_resp.json()["status"] == "completed":
            break
    assert status_resp.json()["status"] == "completed"


async def test_run_status_not_found(client, api_key):
    _, raw = api_key
    resp = await client.get("/v1/runs/nonexistent/status", headers=_headers(raw))
    assert resp.status_code == 404


async def test_run_status_falls_back_to_db(client, api_key):
    _, raw = api_key
    graph_id = await _create_graph(client, raw)
    run_resp = await _start_run(client, graph_id, raw)
    run_id = run_resp.json()["run_id"]
    # Wait for completion
    for _ in range(50):
        await asyncio.sleep(0.1)
        status_resp = await client.get(
            f"/v1/runs/{run_id}/status", headers=_headers(raw)
        )
        if status_resp.json()["status"] == "completed":
            break
    # Remove from RunManager
    app.state.run_manager.cleanup_run(run_id)
    # Should still return from DB
    status_resp = await client.get(f"/v1/runs/{run_id}/status", headers=_headers(raw))
    assert status_resp.status_code == 200


# ── Stream tests ───────────────────────────────────────────────────────


async def test_stream_endpoint_content_type(client, api_key):
    _, raw = api_key
    graph_id = await _create_graph(client, raw)
    run_resp = await _start_run(client, graph_id, raw)
    run_id = run_resp.json()["run_id"]
    resp = await client.get(f"/v1/runs/{run_id}/stream", headers=_headers(raw))
    assert "text/event-stream" in resp.headers.get("content-type", "")


async def test_stream_wrong_owner_returns_404(client, api_key, api_key_b):
    _, raw_a = api_key
    _, raw_b = api_key_b
    graph_id = await _create_graph(client, raw_a)
    run_resp = await _start_run(client, graph_id, raw_a)
    run_id = run_resp.json()["run_id"]
    resp = await client.get(f"/v1/runs/{run_id}/stream", headers=_headers(raw_b))
    assert resp.status_code == 404


async def test_stream_completed_run_returns_terminal_event(client, api_key):
    _, raw = api_key
    graph_id = await _create_graph(client, raw)
    run_resp = await _start_run(client, graph_id, raw)
    run_id = run_resp.json()["run_id"]
    # Wait for completion
    for _ in range(50):
        await asyncio.sleep(0.1)
        s = await client.get(f"/v1/runs/{run_id}/status", headers=_headers(raw))
        if s.json()["status"] == "completed":
            break
    # Remove from RunManager to force DB fallback
    app.state.run_manager.cleanup_run(run_id)
    resp = await client.get(f"/v1/runs/{run_id}/stream", headers=_headers(raw))
    assert "graph_completed" in resp.text


async def test_stream_lost_run_returns_error_event(client, api_key):
    _, raw = api_key
    key, _ = api_key
    # Insert a run directly in DB (not via RunManager)
    db = app.state.db
    graph_id = await _create_graph(client, raw)
    run_id = str(uuid.uuid4())
    await db.execute(
        "INSERT INTO runs (id, graph_id, owner_id, status, input_json, created_at) "
        "VALUES (?, ?, ?, 'running', '{}', datetime('now'))",
        (run_id, graph_id, key.id),
    )
    await db.commit()
    resp = await client.get(f"/v1/runs/{run_id}/stream", headers=_headers(raw))
    assert "Run lost" in resp.text


# ── Resume tests ───────────────────────────────────────────────────────


async def test_resume_not_paused(client, api_key):
    _, raw = api_key
    graph_id = await _create_graph(client, raw)
    run_resp = await _start_run(client, graph_id, raw)
    run_id = run_resp.json()["run_id"]
    resp = await client.post(
        f"/v1/runs/{run_id}/resume",
        json={"input": "test"},
        headers=_headers(raw),
    )
    assert resp.status_code in (409, 404)  # depends on timing


async def test_resume_wrong_owner_returns_404(client, api_key, api_key_b):
    _, raw_a = api_key
    _, raw_b = api_key_b
    graph_id = await _create_graph(client, raw_a)
    run_resp = await _start_run(client, graph_id, raw_a)
    run_id = run_resp.json()["run_id"]
    resp = await client.post(
        f"/v1/runs/{run_id}/resume",
        json={"input": "test"},
        headers=_headers(raw_b),
    )
    assert resp.status_code == 404


async def test_resume_after_server_restart_returns_404(client, api_key):
    _, raw = api_key
    key, _ = api_key
    db = app.state.db
    graph_id = await _create_graph(client, raw)
    run_id = str(uuid.uuid4())
    await db.execute(
        "INSERT INTO runs (id, graph_id, owner_id, status, input_json, created_at) "
        "VALUES (?, ?, ?, 'paused', '{}', datetime('now'))",
        (run_id, graph_id, key.id),
    )
    await db.commit()
    resp = await client.post(
        f"/v1/runs/{run_id}/resume",
        json={"input": "test"},
        headers=_headers(raw),
    )
    assert resp.status_code == 404
