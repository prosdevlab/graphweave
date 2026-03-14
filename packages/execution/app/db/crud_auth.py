"""Async CRUD operations for API keys."""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime

import aiosqlite

from app.db.models import ApiKey


def _utcnow_iso() -> str:
    return datetime.now(UTC).isoformat()


async def create_api_key(
    db: aiosqlite.Connection,
    name: str,
    key_hash: str,
    key_prefix: str,
    scopes: list[str],
) -> ApiKey:
    key_id = str(uuid.uuid4())
    now = _utcnow_iso()
    await db.execute(
        "INSERT INTO api_keys "
        "(id, name, key_hash, key_prefix, scopes, status, created_at) "
        "VALUES (?, ?, ?, ?, ?, 'active', ?)",
        (key_id, name, key_hash, key_prefix, json.dumps(scopes), now),
    )
    await db.commit()
    return ApiKey(
        id=key_id,
        name=name,
        key_hash=key_hash,
        key_prefix=key_prefix,
        scopes=scopes,
        status="active",
        created_at=now,
    )


async def get_api_key_by_hash(db: aiosqlite.Connection, key_hash: str) -> ApiKey | None:
    cursor = await db.execute(
        "SELECT id, name, key_hash, key_prefix, scopes, status, created_at, revoked_at "
        "FROM api_keys WHERE key_hash = ?",
        (key_hash,),
    )
    row = await cursor.fetchone()
    if row is None:
        return None
    return ApiKey(
        id=row[0],
        name=row[1],
        key_hash=row[2],
        key_prefix=row[3],
        scopes=json.loads(row[4]),
        status=row[5],
        created_at=row[6],
        revoked_at=row[7],
    )


async def get_api_key(db: aiosqlite.Connection, key_id: str) -> ApiKey | None:
    cursor = await db.execute(
        "SELECT id, name, key_hash, key_prefix, scopes, status, created_at, revoked_at "
        "FROM api_keys WHERE id = ?",
        (key_id,),
    )
    row = await cursor.fetchone()
    if row is None:
        return None
    return ApiKey(
        id=row[0],
        name=row[1],
        key_hash=row[2],
        key_prefix=row[3],
        scopes=json.loads(row[4]),
        status=row[5],
        created_at=row[6],
        revoked_at=row[7],
    )


async def list_api_keys(
    db: aiosqlite.Connection,
    limit: int = 20,
    offset: int = 0,
) -> tuple[list[ApiKey], int]:
    """Return (keys, total_count) with pagination."""
    count_cursor = await db.execute("SELECT COUNT(*) FROM api_keys")
    total = (await count_cursor.fetchone())[0]
    cursor = await db.execute(
        "SELECT id, name, key_hash, key_prefix, scopes, "
        "status, created_at, revoked_at "
        "FROM api_keys ORDER BY created_at DESC LIMIT ? OFFSET ?",
        (limit, offset),
    )
    rows = await cursor.fetchall()
    keys = [
        ApiKey(
            id=row[0],
            name=row[1],
            key_hash=row[2],
            key_prefix=row[3],
            scopes=json.loads(row[4]),
            status=row[5],
            created_at=row[6],
            revoked_at=row[7],
        )
        for row in rows
    ]
    return keys, total


async def count_active_admin_keys(db: aiosqlite.Connection) -> int:
    """Count active keys that have the 'admin' scope."""
    # Filter in Python because scopes is a JSON array in TEXT
    all_keys, _ = await list_api_keys(db, limit=10000, offset=0)
    return sum(1 for k in all_keys if k.status == "active" and "admin" in k.scopes)


async def revoke_api_key(db: aiosqlite.Connection, key_id: str) -> ApiKey | None:
    now = _utcnow_iso()
    cursor = await db.execute(
        "UPDATE api_keys SET status = 'revoked', revoked_at = ? WHERE id = ?",
        (now, key_id),
    )
    await db.commit()
    if cursor.rowcount == 0:
        return None
    return await get_api_key(db, key_id)
