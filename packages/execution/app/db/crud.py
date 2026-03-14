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


async def create_graph(db: aiosqlite.Connection, name: str, schema_dict: dict) -> Graph:
    graph_id = str(uuid.uuid4())
    now = _utcnow_iso()
    await db.execute(
        "INSERT INTO graphs (id, name, schema_json, created_at, updated_at) "
        "VALUES (?, ?, ?, ?, ?)",
        (graph_id, name, json.dumps(schema_dict), now, now),
    )
    await db.commit()
    return Graph(
        id=graph_id,
        name=name,
        schema_json=schema_dict,
        created_at=now,
        updated_at=now,
    )


async def list_graphs(db: aiosqlite.Connection) -> list[Graph]:
    cursor = await db.execute(
        "SELECT id, name, schema_json, created_at, updated_at FROM graphs"
    )
    rows = await cursor.fetchall()
    return [
        Graph(
            id=row[0],
            name=row[1],
            schema_json=json.loads(row[2]),
            created_at=row[3],
            updated_at=row[4],
        )
        for row in rows
    ]


async def get_graph(db: aiosqlite.Connection, graph_id: str) -> Graph | None:
    cursor = await db.execute(
        "SELECT id, name, schema_json, created_at, updated_at FROM graphs WHERE id = ?",
        (graph_id,),
    )
    row = await cursor.fetchone()
    if row is None:
        return None
    return Graph(
        id=row[0],
        name=row[1],
        schema_json=json.loads(row[2]),
        created_at=row[3],
        updated_at=row[4],
    )


async def update_graph(
    db: aiosqlite.Connection,
    graph_id: str,
    name: str,
    schema_dict: dict,
) -> Graph | None:
    now = _utcnow_iso()

    # Keep schema_dict in sync with table columns
    schema_dict["name"] = name
    schema_dict.setdefault("metadata", {})["updated_at"] = now

    cursor = await db.execute(
        "UPDATE graphs SET name = ?, schema_json = ?, updated_at = ? WHERE id = ?",
        (name, json.dumps(schema_dict), now, graph_id),
    )
    await db.commit()
    if cursor.rowcount == 0:
        return None
    return Graph(
        id=graph_id,
        name=name,
        schema_json=schema_dict,
        created_at="",  # caller can re-fetch if needed
        updated_at=now,
    )


async def delete_graph(db: aiosqlite.Connection, graph_id: str) -> bool:
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

# Map model field names to DB column names where they differ
_RUN_COLUMN_MAP = {
    "final_state": "final_state_json",
}


async def create_run(
    db: aiosqlite.Connection,
    graph_id: str,
    status: str,
    input_data: dict,
) -> Run:
    run_id = str(uuid.uuid4())
    now = _utcnow_iso()
    await db.execute(
        "INSERT INTO runs (id, graph_id, status, input_json, created_at) "
        "VALUES (?, ?, ?, ?, ?)",
        (run_id, graph_id, status, json.dumps(input_data), now),
    )
    await db.commit()
    return Run(
        id=run_id,
        graph_id=graph_id,
        status=status,
        input=input_data,
        created_at=now,
    )


async def get_run(db: aiosqlite.Connection, run_id: str) -> Run | None:
    cursor = await db.execute(
        "SELECT id, graph_id, status, input_json, final_state_json, "
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
        status=row[2],
        input=json.loads(row[3]) if row[3] else {},
        final_state=json.loads(row[4]) if row[4] else None,
        duration_ms=row[5],
        created_at=row[6],
        error=row[7],
        paused_node_id=row[8],
        paused_prompt=row[9],
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
    db: aiosqlite.Connection, graph_id: str, limit: int = 10
) -> list[Run]:
    cursor = await db.execute(
        "SELECT id, graph_id, status, input_json, final_state_json, "
        "duration_ms, created_at, error, paused_node_id, paused_prompt "
        "FROM runs WHERE graph_id = ? ORDER BY created_at DESC LIMIT ?",
        (graph_id, limit),
    )
    rows = await cursor.fetchall()
    return [
        Run(
            id=row[0],
            graph_id=row[1],
            status=row[2],
            input=json.loads(row[3]) if row[3] else {},
            final_state=json.loads(row[4]) if row[4] else None,
            duration_ms=row[5],
            created_at=row[6],
            error=row[7],
            paused_node_id=row[8],
            paused_prompt=row[9],
        )
        for row in rows
    ]
