"""Database lifecycle — init, close, and FastAPI dependency."""

from __future__ import annotations

import os

import aiosqlite
from fastapi import Request

from app.db.migrations.runner import run_migrations


def get_db_path() -> str:
    """Return the SQLite database path.

    Defaults to ``data/graphweave.db`` (relative). Docker sets ``DB_PATH``
    explicitly via ``.env`` to an absolute path like ``/data/graphweave.db``.
    Tests use ``:memory:`` via fixture — unaffected.
    """
    return os.getenv("DB_PATH", "data/graphweave.db")


async def init_db(db_path: str | None = None) -> aiosqlite.Connection:
    """Run migrations and open an async connection.

    Migrations use sync ``sqlite3`` (called once at startup).  The returned
    ``aiosqlite.Connection`` has WAL mode enabled for concurrent reads.
    """
    if db_path is None:
        db_path = get_db_path()

    if db_path != ":memory:":
        os.makedirs(os.path.dirname(db_path) or ".", exist_ok=True)

    run_migrations(db_path)

    db = await aiosqlite.connect(db_path)
    db.row_factory = aiosqlite.Row
    await db.execute("PRAGMA journal_mode=WAL")
    return db


async def close_db(db: aiosqlite.Connection) -> None:
    """Close the database connection."""
    await db.close()


def get_db(request: Request) -> aiosqlite.Connection:
    """FastAPI ``Depends()`` — reads ``request.app.state.db``."""
    return request.app.state.db
