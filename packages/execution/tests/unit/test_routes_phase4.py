"""Integration tests for Phase 4 routes: run history, cancel, delete."""

from __future__ import annotations

import asyncio

import aiosqlite
import httpx
import pytest

from app.auth import SCOPES_DEFAULT
from app.db import crud
from app.db.migrations.runner import run_migrations
from app.executor import RunManager
from app.main import app
from tests.conftest import create_test_key


def _simple_schema():
    """Tool-only schema — no LLM, no API keys needed."""
    return {
        "id": "p4",
        "name": "Phase4Test",
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
        "metadata": {
            "created_at": "2026-01-01",
            "updated_at": "2026-01-01",
        },
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
    await app.state.run_manager.cancel_all()
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


async def _create_graph(client, raw_key):
    resp = await client.post(
        "/v1/graphs",
        headers=_headers(raw_key),
        json={"name": "Test", "schema_json": _simple_schema()},
    )
    return resp.json()["id"]


async def _insert_run(db, graph_id, owner_id, status):
    """Insert a run directly into DB for history tests."""
    return await crud.create_run(db, graph_id, owner_id, status, {})


# ── List Runs for Graph ───────────────────────────────────────────────


async def test_list_runs_for_graph_empty(client, api_key):
    _, raw = api_key
    gid = await _create_graph(client, raw)
    resp = await client.get(f"/v1/graphs/{gid}/runs", headers=_headers(raw))
    assert resp.status_code == 200
    body = resp.json()
    assert body["items"] == []
    assert body["total"] == 0


async def test_list_runs_for_graph_paginated(client, api_key):
    key, raw = api_key
    gid = await _create_graph(client, raw)
    db = app.state.db
    for _ in range(5):
        await _insert_run(db, gid, key.id, "completed")
    resp = await client.get(
        f"/v1/graphs/{gid}/runs?limit=2",
        headers=_headers(raw),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["items"]) == 2
    assert body["total"] == 5
    assert body["has_more"] is True


async def test_list_runs_for_graph_status_filter(client, api_key):
    key, raw = api_key
    gid = await _create_graph(client, raw)
    db = app.state.db
    await _insert_run(db, gid, key.id, "completed")
    await _insert_run(db, gid, key.id, "completed")
    await _insert_run(db, gid, key.id, "error")
    resp = await client.get(
        f"/v1/graphs/{gid}/runs?status=completed",
        headers=_headers(raw),
    )
    body = resp.json()
    assert body["total"] == 2
    assert all(item["status"] == "completed" for item in body["items"])


async def test_list_runs_for_graph_not_found(client, api_key):
    _, raw = api_key
    resp = await client.get(
        "/v1/graphs/nonexistent/runs",
        headers=_headers(raw),
    )
    assert resp.status_code == 404


async def test_list_runs_for_graph_wrong_owner(client, api_key, api_key_b):
    _, raw_a = api_key
    _, raw_b = api_key_b
    gid = await _create_graph(client, raw_a)
    resp = await client.get(f"/v1/graphs/{gid}/runs", headers=_headers(raw_b))
    assert resp.status_code == 404


# ── List All Runs ─────────────────────────────────────────────────────


async def test_list_all_runs(client, api_key):
    key, raw = api_key
    db = app.state.db
    g1 = await _create_graph(client, raw)
    g2 = await _create_graph(client, raw)
    await _insert_run(db, g1, key.id, "completed")
    await _insert_run(db, g2, key.id, "error")
    resp = await client.get("/v1/runs", headers=_headers(raw))
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 2


async def test_list_all_runs_graph_id_filter(client, api_key):
    key, raw = api_key
    db = app.state.db
    g1 = await _create_graph(client, raw)
    g2 = await _create_graph(client, raw)
    await _insert_run(db, g1, key.id, "completed")
    await _insert_run(db, g2, key.id, "completed")
    resp = await client.get(
        f"/v1/runs?graph_id={g1}",
        headers=_headers(raw),
    )
    body = resp.json()
    assert body["total"] == 1
    assert body["items"][0]["graph_id"] == g1


async def test_list_all_runs_excludes_other_owners(client, api_key, api_key_b):
    key_a, raw_a = api_key
    key_b, raw_b = api_key_b
    db = app.state.db
    g1 = await _create_graph(client, raw_a)
    g2 = await _create_graph(client, raw_b)
    await _insert_run(db, g1, key_a.id, "completed")
    await _insert_run(db, g2, key_b.id, "completed")
    resp = await client.get("/v1/runs", headers=_headers(raw_a))
    body = resp.json()
    assert body["total"] == 1
    assert body["items"][0]["graph_id"] == g1


# ── Cancel ────────────────────────────────────────────────────────────


def _pause_schema():
    """Schema with human_input — stays paused so cancel works."""
    return {
        "id": "pause",
        "name": "PauseTest",
        "version": 1,
        "state": [
            {"key": "messages", "type": "list", "reducer": "append"},
            {"key": "answer", "type": "string", "reducer": "replace"},
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
                "config": {
                    "prompt": "Wait here",
                    "input_key": "answer",
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
            {"id": "e1", "source": "s", "target": "ask"},
            {"id": "e2", "source": "ask", "target": "e"},
        ],
        "metadata": {
            "created_at": "2026-01-01",
            "updated_at": "2026-01-01",
        },
    }


async def _create_pause_graph(client, raw_key):
    resp = await client.post(
        "/v1/graphs",
        headers=_headers(raw_key),
        json={
            "name": "Pause",
            "schema_json": _pause_schema(),
        },
    )
    return resp.json()["id"]


async def test_cancel_running_run(client, api_key):
    _, raw = api_key
    gid = await _create_pause_graph(client, raw)
    resp = await client.post(
        f"/v1/graphs/{gid}/run",
        headers=_headers(raw),
        json={},
    )
    assert resp.status_code == 202
    run_id = resp.json()["run_id"]

    # Wait for it to pause
    for _ in range(50):
        resp = await client.get(
            f"/v1/runs/{run_id}/status",
            headers=_headers(raw),
        )
        if resp.json()["status"] == "paused":
            break
        await asyncio.sleep(0.1)

    resp = await client.post(
        f"/v1/runs/{run_id}/cancel",
        headers=_headers(raw),
        json={},
    )
    assert resp.status_code == 202
    assert "cancel" in resp.json()["detail"].lower()


async def test_cancel_already_completed(client, api_key):
    _, raw = api_key
    gid = await _create_graph(client, raw)
    resp = await client.post(
        f"/v1/graphs/{gid}/run",
        headers=_headers(raw),
        json={"input": {"result": "1 + 1"}},
    )
    run_id = resp.json()["run_id"]

    # Wait for completion
    for _ in range(50):
        resp = await client.get(
            f"/v1/runs/{run_id}/status",
            headers=_headers(raw),
        )
        if resp.json()["status"] in ("completed", "error"):
            break
        await asyncio.sleep(0.1)

    resp = await client.post(
        f"/v1/runs/{run_id}/cancel",
        headers=_headers(raw),
        json={},
    )
    assert resp.status_code == 409


async def test_cancel_stale_db_run(client, api_key):
    key, raw = api_key
    db = app.state.db
    gid = await _create_graph(client, raw)
    # Insert run directly in DB as "running" (not in RunManager)
    run = await _insert_run(db, gid, key.id, "running")

    resp = await client.post(
        f"/v1/runs/{run.id}/cancel",
        headers=_headers(raw),
        json={},
    )
    assert resp.status_code == 202

    # Verify DB status updated
    updated = await crud.get_run(db, run.id)
    assert updated.status == "error"
    assert "server lost" in updated.error.lower()


async def test_cancel_not_found(client, api_key):
    _, raw = api_key
    resp = await client.post(
        "/v1/runs/nonexistent/cancel",
        headers=_headers(raw),
        json={},
    )
    assert resp.status_code == 404


# ── Delete ────────────────────────────────────────────────────────────


async def test_delete_completed_run(client, api_key):
    key, raw = api_key
    db = app.state.db
    gid = await _create_graph(client, raw)
    run = await _insert_run(db, gid, key.id, "completed")

    resp = await client.delete(f"/v1/runs/{run.id}", headers=_headers(raw))
    assert resp.status_code == 204

    # Verify it's gone
    resp = await client.get(
        f"/v1/runs/{run.id}/status",
        headers=_headers(raw),
    )
    assert resp.status_code == 404


async def test_delete_active_run_rejected(client, api_key):
    key, raw = api_key
    db = app.state.db
    gid = await _create_graph(client, raw)
    # Insert a run with "running" status directly in DB
    run = await _insert_run(db, gid, key.id, "running")

    resp = await client.delete(f"/v1/runs/{run.id}", headers=_headers(raw))
    assert resp.status_code == 409
    assert "cancel it first" in resp.json()["detail"].lower()
