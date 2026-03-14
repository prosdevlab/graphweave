"""Tests for async CRUD operations."""

from __future__ import annotations

import aiosqlite
import pytest

from app.db.crud import (
    create_graph,
    create_run,
    delete_graph,
    get_graph,
    get_run,
    list_graphs,
    list_runs_by_graph,
    update_graph,
    update_run,
)
from app.db.migrations.runner import run_migrations


@pytest.fixture
async def db(tmp_path):
    db_path = str(tmp_path / "test.db")
    run_migrations(db_path)
    conn = await aiosqlite.connect(db_path)
    conn.row_factory = aiosqlite.Row
    yield conn
    await conn.close()


# ── Graphs ──────────────────────────────────────────────────────────────


async def test_create_and_get_graph(db):
    schema = {"nodes": [], "edges": []}
    graph = await create_graph(db, "My Graph", schema)
    assert graph.name == "My Graph"
    assert graph.schema_json == schema
    assert graph.id
    assert graph.created_at

    fetched = await get_graph(db, graph.id)
    assert fetched is not None
    assert fetched.name == "My Graph"
    assert fetched.schema_json == schema


async def test_list_graphs(db):
    await create_graph(db, "A", {})
    await create_graph(db, "B", {})
    graphs = await list_graphs(db)
    assert len(graphs) == 2
    names = {g.name for g in graphs}
    assert names == {"A", "B"}


async def test_update_graph(db):
    graph = await create_graph(db, "Old", {"metadata": {}})
    updated = await update_graph(db, graph.id, "New", {"metadata": {}})
    assert updated is not None
    assert updated.name == "New"
    assert updated.updated_at > graph.created_at
    # Schema should have synced name
    assert updated.schema_json["name"] == "New"


async def test_update_graph_nonexistent(db):
    result = await update_graph(db, "missing-id", "X", {})
    assert result is None


async def test_delete_graph(db):
    graph = await create_graph(db, "ToDelete", {})
    assert await delete_graph(db, graph.id) is True
    assert await get_graph(db, graph.id) is None
    assert await delete_graph(db, graph.id) is False


async def test_get_graph_missing(db):
    assert await get_graph(db, "nonexistent") is None


# ── Runs ────────────────────────────────────────────────────────────────


async def test_create_and_get_run(db):
    graph = await create_graph(db, "G", {})
    run = await create_run(db, graph.id, "running", {"prompt": "hello"})
    assert run.status == "running"
    assert run.input == {"prompt": "hello"}

    fetched = await get_run(db, run.id)
    assert fetched is not None
    assert fetched.graph_id == graph.id


async def test_update_run_partial(db):
    graph = await create_graph(db, "G", {})
    run = await create_run(db, graph.id, "running", {})
    updated = await update_run(db, run.id, status="completed", duration_ms=42)
    assert updated is not None
    assert updated.status == "completed"
    assert updated.duration_ms == 42


async def test_update_run_invalid_field(db):
    graph = await create_graph(db, "G", {})
    run = await create_run(db, graph.id, "running", {})
    with pytest.raises(ValueError, match="Cannot update fields"):
        await update_run(db, run.id, bad_field="nope")


async def test_update_run_nonexistent(db):
    result = await update_run(db, "missing", status="error")
    assert result is None


async def test_list_runs_by_graph(db):
    graph = await create_graph(db, "G", {})
    for i in range(5):
        await create_run(db, graph.id, "completed", {"i": i})
    runs = await list_runs_by_graph(db, graph.id, limit=3)
    assert len(runs) == 3
    # Should be ordered DESC by created_at
    assert runs[0].created_at >= runs[1].created_at


async def test_get_run_missing(db):
    assert await get_run(db, "nonexistent") is None
