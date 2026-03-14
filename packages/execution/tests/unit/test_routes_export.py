"""Integration tests for the export route."""

from __future__ import annotations

import aiosqlite
import httpx
import pytest

from app.auth import SCOPES_DEFAULT
from app.db.migrations.runner import run_migrations
from app.executor import RunManager
from app.main import app
from tests.conftest import create_test_key


def _simple_schema():
    return {
        "id": "exp",
        "name": "ExportTest",
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


def _headers(raw_key: str) -> dict:
    return {"X-API-Key": raw_key}


async def _create_graph(client, raw_key):
    resp = await client.post(
        "/v1/graphs",
        headers=_headers(raw_key),
        json={"name": "Test", "schema_json": _simple_schema()},
    )
    return resp.json()["id"]


async def test_export_route_returns_200(client, api_key):
    _, raw = api_key
    gid = await _create_graph(client, raw)
    resp = await client.get(f"/v1/graphs/{gid}/export", headers=_headers(raw))
    assert resp.status_code == 200
    body = resp.json()
    assert "code" in body
    assert "requirements" in body
    assert "class GraphState(TypedDict):" in body["code"]
    assert "langgraph" in body["requirements"]


async def test_export_route_not_found(client, api_key):
    _, raw = api_key
    resp = await client.get("/v1/graphs/nonexistent/export", headers=_headers(raw))
    assert resp.status_code == 404


async def test_export_route_wrong_owner(client, api_key):
    """Export as different owner returns 404, not the graph code."""
    _, raw_a = api_key
    gid = await _create_graph(client, raw_a)

    # Create a second user
    db = app.state.db
    _, raw_b = await create_test_key(db, scopes=SCOPES_DEFAULT, name="other")

    resp = await client.get(f"/v1/graphs/{gid}/export", headers=_headers(raw_b))
    assert resp.status_code == 404
