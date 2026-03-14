"""Tests for auth FastAPI dependencies."""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from app.auth.deps import require_auth, require_scope
from tests.conftest import create_test_key


async def _make_request(api_key_value: str | None = None):
    """Create a mock Request with optional X-API-Key header."""
    request = MagicMock()
    if api_key_value:
        request.headers = {"X-API-Key": api_key_value}
    else:
        request.headers = {}
    return request


async def test_valid_key_returns_auth_context(db):
    api_key, raw_key = await create_test_key(db, scopes=["graphs:read"])
    auth = await require_auth(raw_key=raw_key, db=db)
    assert auth.owner_id == api_key.id
    assert auth.scopes == ["graphs:read"]
    assert auth.is_admin is False


async def test_admin_key_is_admin(db):
    api_key, raw_key = await create_test_key(db, scopes=["admin", "graphs:read"])
    auth = await require_auth(raw_key=raw_key, db=db)
    assert auth.is_admin is True


async def test_invalid_token_raises_401(db):
    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc_info:
        await require_auth(raw_key="gw_invalid_key_here", db=db)
    assert exc_info.value.status_code == 401


async def test_revoked_key_raises_401(db):
    from fastapi import HTTPException

    from app.db.crud_auth import revoke_api_key

    api_key, raw_key = await create_test_key(db)
    await revoke_api_key(db, api_key.id)

    with pytest.raises(HTTPException) as exc_info:
        await require_auth(raw_key=raw_key, db=db)
    assert exc_info.value.status_code == 401


async def test_require_scope_passes(db):
    api_key, raw_key = await create_test_key(db, scopes=["graphs:read"])
    checker = require_scope("graphs:read")
    auth = await require_auth(raw_key=raw_key, db=db)
    result = await checker(auth=auth)
    assert result.owner_id == api_key.id


async def test_require_scope_missing_raises_403(db):
    from fastapi import HTTPException

    api_key, raw_key = await create_test_key(db, scopes=["graphs:read"])
    checker = require_scope("admin")
    auth = await require_auth(raw_key=raw_key, db=db)

    with pytest.raises(HTTPException) as exc_info:
        await checker(auth=auth)
    assert exc_info.value.status_code == 403
