"""Async CRUD operations for graphs and runs."""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime

import aiosqlite

from app.db.models import Graph, Run


def _utcnow_iso() -> str:
    return datetime.now(UTC).isoformat()


# ── Graphs ──────────────────────────────────────────────────────────────


async def create_graph(
    db: aiosqlite.Connection,
    name: str,
    schema_dict: dict,
    owner_id: str,
) -> Graph:
    graph_id = str(uuid.uuid4())
    now = _utcnow_iso()
    await db.execute(
        "INSERT INTO graphs (id, name, schema_json, owner_id, created_at, updated_at) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (graph_id, name, json.dumps(schema_dict), owner_id, now, now),
    )
    await db.commit()
    return Graph(
        id=graph_id,
        name=name,
        schema_json=schema_dict,
        owner_id=owner_id,
        created_at=now,
        updated_at=now,
    )


async def list_graphs(
    db: aiosqlite.Connection,
    owner_id: str | None = None,
    limit: int = 20,
    offset: int = 0,
) -> tuple[list[Graph], int]:
    """Return (graphs, total_count) with pagination.

    ``owner_id=None`` means admin — no filter. Route layer must enforce.
    """
    if owner_id is not None:
        count_cursor = await db.execute(
            "SELECT COUNT(*) FROM graphs WHERE owner_id = ?",
            (owner_id,),
        )
        cursor = await db.execute(
            "SELECT id, name, schema_json, owner_id, created_at, updated_at "
            "FROM graphs WHERE owner_id = ? "
            "ORDER BY created_at DESC LIMIT ? OFFSET ?",
            (owner_id, limit, offset),
        )
    else:
        count_cursor = await db.execute("SELECT COUNT(*) FROM graphs")
        cursor = await db.execute(
            "SELECT id, name, schema_json, owner_id, created_at, updated_at "
            "FROM graphs ORDER BY created_at DESC LIMIT ? OFFSET ?",
            (limit, offset),
        )
    total = (await count_cursor.fetchone())[0]
    rows = await cursor.fetchall()
    graphs = [
        Graph(
            id=row[0],
            name=row[1],
            schema_json=json.loads(row[2]),
            owner_id=row[3],
            created_at=row[4],
            updated_at=row[5],
        )
        for row in rows
    ]
    return graphs, total


async def get_graph(
    db: aiosqlite.Connection,
    graph_id: str,
    owner_id: str | None = None,
) -> Graph | None:
    # None = admin, no filter. Route layer must enforce.
    if owner_id is not None:
        cursor = await db.execute(
            "SELECT id, name, schema_json, owner_id, created_at, updated_at "
            "FROM graphs WHERE id = ? AND owner_id = ?",
            (graph_id, owner_id),
        )
    else:
        cursor = await db.execute(
            "SELECT id, name, schema_json, owner_id, created_at, updated_at "
            "FROM graphs WHERE id = ?",
            (graph_id,),
        )
    row = await cursor.fetchone()
    if row is None:
        return None
    return Graph(
        id=row[0],
        name=row[1],
        schema_json=json.loads(row[2]),
        owner_id=row[3],
        created_at=row[4],
        updated_at=row[5],
    )


async def update_graph(
    db: aiosqlite.Connection,
    graph_id: str,
    name: str,
    schema_dict: dict,
    owner_id: str | None = None,
) -> Graph | None:
    # None = admin, no filter. Route layer must enforce.
    now = _utcnow_iso()

    schema_dict["name"] = name
    schema_dict.setdefault("metadata", {})["updated_at"] = now

    if owner_id is not None:
        cursor = await db.execute(
            "UPDATE graphs SET name = ?, schema_json = ?, updated_at = ? "
            "WHERE id = ? AND owner_id = ?",
            (name, json.dumps(schema_dict), now, graph_id, owner_id),
        )
    else:
        cursor = await db.execute(
            "UPDATE graphs SET name = ?, schema_json = ?, updated_at = ? WHERE id = ?",
            (name, json.dumps(schema_dict), now, graph_id),
        )
    await db.commit()
    if cursor.rowcount == 0:
        return None
    return await get_graph(db, graph_id, owner_id=owner_id)


async def delete_graph(
    db: aiosqlite.Connection,
    graph_id: str,
    owner_id: str | None = None,
) -> bool:
    # None = admin, no filter. Route layer must enforce.
    if owner_id is not None:
        cursor = await db.execute(
            "DELETE FROM graphs WHERE id = ? AND owner_id = ?",
            (graph_id, owner_id),
        )
    else:
        cursor = await db.execute("DELETE FROM graphs WHERE id = ?", (graph_id,))
    await db.commit()
    return cursor.rowcount > 0


# ── Runs ────────────────────────────────────────────────────────────────

_UPDATABLE_RUN_FIELDS = {
    "status",
    "final_state",
    "duration_ms",
    "error",
    "paused_node_id",
    "paused_prompt",
}

_RUN_COLUMN_MAP = {
    "final_state": "final_state_json",
}


async def create_run(
    db: aiosqlite.Connection,
    graph_id: str,
    owner_id: str,
    status: str,
    input_data: dict,
) -> Run:
    run_id = str(uuid.uuid4())
    now = _utcnow_iso()
    await db.execute(
        "INSERT INTO runs (id, graph_id, owner_id, status, input_json, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (run_id, graph_id, owner_id, status, json.dumps(input_data), now),
    )
    await db.commit()
    return Run(
        id=run_id,
        graph_id=graph_id,
        owner_id=owner_id,
        status=status,
        input=input_data,
        created_at=now,
    )


async def get_run(
    db: aiosqlite.Connection,
    run_id: str,
    owner_id: str | None = None,
) -> Run | None:
    # None = admin, no filter. Route layer must enforce.
    if owner_id is not None:
        cursor = await db.execute(
            "SELECT id, graph_id, owner_id, status, input_json, final_state_json, "
            "duration_ms, created_at, error, paused_node_id, paused_prompt "
            "FROM runs WHERE id = ? AND owner_id = ?",
            (run_id, owner_id),
        )
    else:
        cursor = await db.execute(
            "SELECT id, graph_id, owner_id, status, input_json, final_state_json, "
            "duration_ms, created_at, error, paused_node_id, paused_prompt "
            "FROM runs WHERE id = ?",
            (run_id,),
        )
    row = await cursor.fetchone()
    if row is None:
        return None
    return Run(
        id=row[0],
        graph_id=row[1],
        owner_id=row[2],
        status=row[3],
        input=json.loads(row[4]) if row[4] else {},
        final_state=json.loads(row[5]) if row[5] else None,
        duration_ms=row[6],
        created_at=row[7],
        error=row[8],
        paused_node_id=row[9],
        paused_prompt=row[10],
    )


async def update_run(
    db: aiosqlite.Connection, run_id: str, **fields: object
) -> Run | None:
    invalid = set(fields) - _UPDATABLE_RUN_FIELDS
    if invalid:
        raise ValueError(f"Cannot update fields: {invalid}")

    set_parts: list[str] = []
    values: list[object] = []
    for field_name, value in fields.items():
        col = _RUN_COLUMN_MAP.get(field_name, field_name)
        if field_name == "final_state" and value is not None:
            value = json.dumps(value)
        set_parts.append(f"{col} = ?")
        values.append(value)

    values.append(run_id)
    cursor = await db.execute(
        f"UPDATE runs SET {', '.join(set_parts)} WHERE id = ?",  # noqa: S608
        values,
    )
    await db.commit()
    if cursor.rowcount == 0:
        return None
    return await get_run(db, run_id)


async def list_runs_by_graph(
    db: aiosqlite.Connection,
    graph_id: str,
    owner_id: str | None = None,
    status: str | None = None,
    limit: int = 20,
    offset: int = 0,
) -> tuple[list[Run], int]:
    """Return (runs, total_count) for a specific graph with pagination."""
    where = ["graph_id = ?"]
    params: list[object] = [graph_id]
    if owner_id is not None:
        where.append("owner_id = ?")
        params.append(owner_id)
    if status is not None:
        where.append("status = ?")
        params.append(status)

    where_clause = " AND ".join(where)
    count_cursor = await db.execute(
        f"SELECT COUNT(*) FROM runs WHERE {where_clause}",  # noqa: S608
        params,
    )
    total = (await count_cursor.fetchone())[0]

    cursor = await db.execute(
        f"SELECT id, graph_id, owner_id, status, input_json, "  # noqa: S608
        "final_state_json, duration_ms, created_at, error, "
        "paused_node_id, paused_prompt "
        f"FROM runs WHERE {where_clause} "
        "ORDER BY created_at DESC LIMIT ? OFFSET ?",
        [*params, limit, offset],
    )
    rows = await cursor.fetchall()
    return _rows_to_runs(rows), total


async def list_runs(
    db: aiosqlite.Connection,
    owner_id: str | None = None,
    graph_id: str | None = None,
    status: str | None = None,
    limit: int = 20,
    offset: int = 0,
) -> tuple[list[Run], int]:
    """Return (runs, total_count) across all graphs with pagination."""
    where: list[str] = []
    params: list[object] = []
    if owner_id is not None:
        where.append("owner_id = ?")
        params.append(owner_id)
    if graph_id is not None:
        where.append("graph_id = ?")
        params.append(graph_id)
    if status is not None:
        where.append("status = ?")
        params.append(status)

    where_clause = (" WHERE " + " AND ".join(where)) if where else ""
    count_cursor = await db.execute(
        f"SELECT COUNT(*) FROM runs{where_clause}",  # noqa: S608
        params,
    )
    total = (await count_cursor.fetchone())[0]

    cursor = await db.execute(
        "SELECT id, graph_id, owner_id, status, input_json, "
        "final_state_json, duration_ms, created_at, error, "
        "paused_node_id, paused_prompt "
        f"FROM runs{where_clause} "  # noqa: S608
        "ORDER BY created_at DESC LIMIT ? OFFSET ?",
        [*params, limit, offset],
    )
    rows = await cursor.fetchall()
    return _rows_to_runs(rows), total


async def delete_run(
    db: aiosqlite.Connection,
    run_id: str,
    owner_id: str | None = None,
) -> bool:
    """Delete a run by ID. Returns True if deleted."""
    if owner_id is not None:
        cursor = await db.execute(
            "DELETE FROM runs WHERE id = ? AND owner_id = ?",
            (run_id, owner_id),
        )
    else:
        cursor = await db.execute("DELETE FROM runs WHERE id = ?", (run_id,))
    await db.commit()
    return cursor.rowcount > 0


def _rows_to_runs(rows: list) -> list[Run]:
    return [
        Run(
            id=row[0],
            graph_id=row[1],
            owner_id=row[2],
            status=row[3],
            input=json.loads(row[4]) if row[4] else {},
            final_state=json.loads(row[5]) if row[5] else None,
            duration_ms=row[6],
            created_at=row[7],
            error=row[8],
            paused_node_id=row[9],
            paused_prompt=row[10],
        )
        for row in rows
    ]
