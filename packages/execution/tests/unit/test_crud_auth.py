"""Tests for API key CRUD operations."""

from __future__ import annotations

from app.auth.keys import generate_api_key, get_key_display_prefix
from app.db.crud_auth import (
    count_active_admin_keys,
    create_api_key,
    get_api_key,
    get_api_key_by_hash,
    list_api_keys,
    revoke_api_key,
)


async def test_create_and_get_by_hash(db):
    raw_key, key_hash = generate_api_key()
    prefix = get_key_display_prefix(raw_key)
    scopes = ["graphs:read", "graphs:write"]
    key = await create_api_key(db, "test", key_hash, prefix, scopes)
    assert key.name == "test"
    assert key.scopes == scopes
    assert key.status == "active"

    fetched = await get_api_key_by_hash(db, key_hash)
    assert fetched is not None
    assert fetched.id == key.id


async def test_get_by_hash_not_found(db):
    result = await get_api_key_by_hash(db, "nonexistent_hash")
    assert result is None


async def test_list_api_keys(db):
    _, h1 = generate_api_key()
    _, h2 = generate_api_key()
    await create_api_key(db, "key1", h1, "gw_aaa", ["graphs:read"])
    await create_api_key(db, "key2", h2, "gw_bbb", ["graphs:write"])
    keys, total = await list_api_keys(db)
    assert len(keys) == 2
    assert total == 2


async def test_get_by_id(db):
    _, key_hash = generate_api_key()
    key = await create_api_key(db, "test", key_hash, "gw_xxx", ["admin"])
    fetched = await get_api_key(db, key.id)
    assert fetched is not None
    assert fetched.name == "test"


async def test_revoke_sets_status(db):
    _, key_hash = generate_api_key()
    key = await create_api_key(db, "test", key_hash, "gw_xxx", ["admin"])
    revoked = await revoke_api_key(db, key.id)
    assert revoked is not None
    assert revoked.status == "revoked"
    assert revoked.revoked_at is not None


async def test_revoke_nonexistent(db):
    result = await revoke_api_key(db, "missing-id")
    assert result is None


async def test_scopes_stored_as_list(db):
    _, key_hash = generate_api_key()
    scopes = ["graphs:read", "graphs:write", "admin"]
    key = await create_api_key(db, "test", key_hash, "gw_xxx", scopes)
    fetched = await get_api_key(db, key.id)
    assert fetched is not None
    assert isinstance(fetched.scopes, list)
    assert fetched.scopes == scopes


async def test_count_active_admin_keys(db):
    _, h1 = generate_api_key()
    _, h2 = generate_api_key()
    _, h3 = generate_api_key()
    await create_api_key(db, "admin1", h1, "gw_aaa", ["admin", "graphs:read"])
    await create_api_key(db, "admin2", h2, "gw_bbb", ["admin"])
    await create_api_key(db, "user", h3, "gw_ccc", ["graphs:read"])

    count = await count_active_admin_keys(db)
    assert count == 2

    # Revoke one admin
    keys, _ = await list_api_keys(db)
    admin_key = next(k for k in keys if k.name == "admin1")
    await revoke_api_key(db, admin_key.id)

    count = await count_active_admin_keys(db)
    assert count == 1
