"""Tests for async CRUD operations."""

from __future__ import annotations

import pytest

from app.db.crud import (
    create_graph,
    create_run,
    delete_graph,
    delete_run,
    get_graph,
    get_run,
    list_graphs,
    list_runs,
    list_runs_by_graph,
    update_graph,
    update_run,
)

# ── Graphs ──────────────────────────────────────────────────────────────


async def test_create_and_get_graph(db):
    schema = {"nodes": [], "edges": []}
    graph = await create_graph(db, "My Graph", schema, owner_id="owner-a")
    assert graph.name == "My Graph"
    assert graph.schema_json == schema
    assert graph.owner_id == "owner-a"
    assert graph.id
    assert graph.created_at

    fetched = await get_graph(db, graph.id, owner_id="owner-a")
    assert fetched is not None
    assert fetched.name == "My Graph"
    assert fetched.schema_json == schema


async def test_list_graphs(db):
    await create_graph(db, "A", {}, owner_id="owner-a")
    await create_graph(db, "B", {}, owner_id="owner-a")
    graphs, total = await list_graphs(db, owner_id="owner-a")
    assert len(graphs) == 2
    assert total == 2
    names = {g.name for g in graphs}
    assert names == {"A", "B"}


async def test_update_graph(db):
    graph = await create_graph(db, "Old", {"metadata": {}}, owner_id="owner-a")
    updated = await update_graph(
        db, graph.id, "New", {"metadata": {}}, owner_id="owner-a"
    )
    assert updated is not None
    assert updated.name == "New"
    assert updated.updated_at > graph.created_at
    assert updated.schema_json["name"] == "New"
    # Fix: update_graph now re-reads row, so created_at should be populated
    assert updated.created_at != ""


async def test_update_graph_nonexistent(db):
    result = await update_graph(db, "missing-id", "X", {}, owner_id="owner-a")
    assert result is None


async def test_delete_graph(db):
    graph = await create_graph(db, "ToDelete", {}, owner_id="owner-a")
    assert await delete_graph(db, graph.id, owner_id="owner-a") is True
    assert await get_graph(db, graph.id, owner_id="owner-a") is None
    assert await delete_graph(db, graph.id, owner_id="owner-a") is False


async def test_get_graph_missing(db):
    assert await get_graph(db, "nonexistent", owner_id="owner-a") is None


# ── Owner isolation ─────────────────────────────────────────────────────


async def test_owner_isolation_get(db):
    graph = await create_graph(db, "A's graph", {}, owner_id="owner-a")
    # Owner B cannot see owner A's graph
    assert await get_graph(db, graph.id, owner_id="owner-b") is None


async def test_owner_isolation_list(db):
    await create_graph(db, "A1", {}, owner_id="owner-a")
    await create_graph(db, "A2", {}, owner_id="owner-a")
    await create_graph(db, "B1", {}, owner_id="owner-b")

    a_graphs, a_total = await list_graphs(db, owner_id="owner-a")
    b_graphs, b_total = await list_graphs(db, owner_id="owner-b")
    assert len(a_graphs) == 2
    assert a_total == 2
    assert len(b_graphs) == 1
    assert b_total == 1


async def test_admin_sees_all(db):
    await create_graph(db, "A1", {}, owner_id="owner-a")
    await create_graph(db, "B1", {}, owner_id="owner-b")
    # Admin passes owner_id=None → no filter
    all_graphs, total = await list_graphs(db, owner_id=None)
    assert len(all_graphs) == 2
    assert total == 2


async def test_owner_isolation_update(db):
    graph = await create_graph(db, "A's graph", {}, owner_id="owner-a")
    result = await update_graph(db, graph.id, "Hacked", {}, owner_id="owner-b")
    assert result is None  # Can't update someone else's graph


async def test_owner_isolation_delete(db):
    graph = await create_graph(db, "A's graph", {}, owner_id="owner-a")
    assert await delete_graph(db, graph.id, owner_id="owner-b") is False


# ── Runs ────────────────────────────────────────────────────────────────


async def test_create_and_get_run(db):
    graph = await create_graph(db, "G", {}, owner_id="owner-a")
    run = await create_run(db, graph.id, "owner-a", "running", {"prompt": "hello"})
    assert run.status == "running"
    assert run.input == {"prompt": "hello"}
    assert run.owner_id == "owner-a"

    fetched = await get_run(db, run.id)
    assert fetched is not None
    assert fetched.graph_id == graph.id


async def test_update_run_partial(db):
    graph = await create_graph(db, "G", {}, owner_id="owner-a")
    run = await create_run(db, graph.id, "owner-a", "running", {})
    updated = await update_run(db, run.id, status="completed", duration_ms=42)
    assert updated is not None
    assert updated.status == "completed"
    assert updated.duration_ms == 42


async def test_update_run_invalid_field(db):
    graph = await create_graph(db, "G", {}, owner_id="owner-a")
    run = await create_run(db, graph.id, "owner-a", "running", {})
    with pytest.raises(ValueError, match="Cannot update fields"):
        await update_run(db, run.id, bad_field="nope")


async def test_update_run_nonexistent(db):
    result = await update_run(db, "missing", status="error")
    assert result is None


async def test_list_runs_by_graph(db):
    graph = await create_graph(db, "G", {}, owner_id="owner-a")
    for i in range(5):
        await create_run(db, graph.id, "owner-a", "completed", {"i": i})
    runs, total = await list_runs_by_graph(db, graph.id, owner_id="owner-a", limit=3)
    assert len(runs) == 3
    assert total == 5
    assert runs[0].created_at >= runs[1].created_at


async def test_get_run_missing(db):
    assert await get_run(db, "nonexistent") is None


# ── Run pagination & filtering ─────────────────────────────────────


async def test_list_runs_by_graph_paginated(db):
    graph = await create_graph(db, "G", {}, owner_id="o")
    for i in range(5):
        await create_run(db, graph.id, "o", "completed", {"i": i})
    runs, total = await list_runs_by_graph(
        db, graph.id, owner_id="o", limit=2, offset=0
    )
    assert len(runs) == 2
    assert total == 5


async def test_list_runs_by_graph_offset(db):
    graph = await create_graph(db, "G", {}, owner_id="o")
    for i in range(5):
        await create_run(db, graph.id, "o", "completed", {"i": i})
    runs, total = await list_runs_by_graph(
        db, graph.id, owner_id="o", limit=2, offset=2
    )
    assert len(runs) == 2
    assert total == 5


async def test_list_runs_by_graph_status_filter(db):
    graph = await create_graph(db, "G", {}, owner_id="o")
    await create_run(db, graph.id, "o", "completed", {})
    await create_run(db, graph.id, "o", "completed", {})
    await create_run(db, graph.id, "o", "error", {})
    runs, total = await list_runs_by_graph(
        db, graph.id, owner_id="o", status="completed"
    )
    assert len(runs) == 2
    assert total == 2


async def test_list_runs_by_graph_owner_isolation(db):
    graph = await create_graph(db, "G", {}, owner_id="o-a")
    await create_run(db, graph.id, "o-a", "completed", {})
    await create_run(db, graph.id, "o-b", "completed", {})
    runs, total = await list_runs_by_graph(db, graph.id, owner_id="o-a")
    assert len(runs) == 1
    assert total == 1


async def test_list_runs_all_graphs(db):
    g1 = await create_graph(db, "G1", {}, owner_id="o")
    g2 = await create_graph(db, "G2", {}, owner_id="o")
    await create_run(db, g1.id, "o", "completed", {})
    await create_run(db, g2.id, "o", "completed", {})
    runs, total = await list_runs(db, owner_id="o")
    assert len(runs) == 2
    assert total == 2


async def test_list_runs_graph_id_filter(db):
    g1 = await create_graph(db, "G1", {}, owner_id="o")
    g2 = await create_graph(db, "G2", {}, owner_id="o")
    await create_run(db, g1.id, "o", "completed", {})
    await create_run(db, g2.id, "o", "completed", {})
    runs, total = await list_runs(db, owner_id="o", graph_id=g1.id)
    assert len(runs) == 1
    assert total == 1
    assert runs[0].graph_id == g1.id


async def test_list_runs_status_filter(db):
    graph = await create_graph(db, "G", {}, owner_id="o")
    await create_run(db, graph.id, "o", "completed", {})
    await create_run(db, graph.id, "o", "error", {})
    await create_run(db, graph.id, "o", "error", {})
    runs, total = await list_runs(db, owner_id="o", status="error")
    assert len(runs) == 2
    assert total == 2


async def test_delete_run_success(db):
    graph = await create_graph(db, "G", {}, owner_id="o")
    run = await create_run(db, graph.id, "o", "completed", {})
    assert await delete_run(db, run.id, owner_id="o") is True
    assert await get_run(db, run.id) is None


async def test_delete_run_wrong_owner(db):
    graph = await create_graph(db, "G", {}, owner_id="o-a")
    run = await create_run(db, graph.id, "o-a", "completed", {})
    assert await delete_run(db, run.id, owner_id="o-b") is False
    assert await get_run(db, run.id) is not None
