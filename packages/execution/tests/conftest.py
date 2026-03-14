"""Shared test fixtures."""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime

import aiosqlite
import pytest

from app.auth import SCOPES_DEFAULT
from app.auth.keys import generate_api_key, get_key_display_prefix
from app.db.migrations.runner import run_migrations
from app.db.models import ApiKey


@pytest.fixture
async def db(tmp_path):
    """In-memory-like DB with all migrations applied."""
    db_path = str(tmp_path / "test.db")
    run_migrations(db_path)
    conn = await aiosqlite.connect(db_path)
    conn.row_factory = aiosqlite.Row
    yield conn
    await conn.close()


async def create_test_key(
    db: aiosqlite.Connection,
    scopes: list[str] | None = None,
    name: str = "test-key",
) -> tuple[ApiKey, str]:
    """Create a test API key and return (ApiKey, raw_key)."""
    if scopes is None:
        scopes = SCOPES_DEFAULT
    raw_key, key_hash = generate_api_key()
    prefix = get_key_display_prefix(raw_key)
    key_id = str(uuid.uuid4())
    now = datetime.now(UTC).isoformat()
    await db.execute(
        "INSERT INTO api_keys "
        "(id, name, key_hash, key_prefix, scopes, status, created_at) "
        "VALUES (?, ?, ?, ?, ?, 'active', ?)",
        (key_id, name, key_hash, prefix, json.dumps(scopes), now),
    )
    await db.commit()
    api_key = ApiKey(
        id=key_id,
        name=name,
        key_hash=key_hash,
        key_prefix=prefix,
        scopes=scopes,
        status="active",
        created_at=now,
    )
    return api_key, raw_key
