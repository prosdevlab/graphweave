"""Integration tests for auth and graph routes."""

from __future__ import annotations

import aiosqlite
import httpx
import pytest

from app.auth import SCOPES_ADMIN, SCOPES_DEFAULT
from app.db.migrations.runner import run_migrations
from app.main import app
from tests.conftest import create_test_key


@pytest.fixture
async def client(tmp_path):
    """AsyncClient with test DB wired into app.state."""
    db_path = str(tmp_path / "test.db")
    run_migrations(db_path)
    db = await aiosqlite.connect(db_path)
    db.row_factory = aiosqlite.Row
    app.state.db = db
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    await db.close()


@pytest.fixture
async def admin_key(client):
    db = app.state.db
    key, raw = await create_test_key(db, scopes=SCOPES_ADMIN, name="admin")
    return key, raw


@pytest.fixture
async def user_key(client):
    db = app.state.db
    key, raw = await create_test_key(db, scopes=SCOPES_DEFAULT, name="user")
    return key, raw


def _headers(raw_key: str) -> dict:
    return {"X-API-Key": raw_key}


# ── Middleware ──────────────────────────────────────────────────────────


async def test_request_id_in_response(client):
    resp = await client.get("/health")
    assert "X-Request-ID" in resp.headers


async def test_request_id_echoed_back(client):
    resp = await client.get("/health", headers={"X-Request-ID": "my-custom-id"})
    assert resp.headers["X-Request-ID"] == "my-custom-id"


async def test_content_type_enforcement_415(client, user_key):
    _, user_raw = user_key
    resp = await client.post(
        "/v1/graphs",
        headers={"X-API-Key": user_raw, "Content-Type": "text/plain"},
        content="not json",
    )
    assert resp.status_code == 415
    assert resp.json()["status_code"] == 415


async def test_get_skips_content_type_check(client, user_key):
    _, user_raw = user_key
    resp = await client.get("/v1/graphs", headers=_headers(user_raw))
    assert resp.status_code == 200


# ── Error envelope ──────────────────────────────────────────────────────


async def test_error_response_has_status_code(client):
    resp = await client.get("/v1/graphs")
    assert resp.status_code == 401
    body = resp.json()
    assert body["status_code"] == 401
    assert "detail" in body


# ── Auth: key management ────────────────────────────────────────────────


async def test_create_key_returns_201(client, admin_key):
    _, admin_raw = admin_key
    resp = await client.post(
        "/v1/auth/keys",
        headers=_headers(admin_raw),
        json={"name": "new-key", "scopes": ["graphs:read"]},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["api_key"].startswith("gw_")
    assert data["scopes"] == ["graphs:read"]


async def test_create_key_unknown_scope_422(client, admin_key):
    _, admin_raw = admin_key
    resp = await client.post(
        "/v1/auth/keys",
        headers=_headers(admin_raw),
        json={"name": "bad", "scopes": ["nonexistent:scope"]},
    )
    assert resp.status_code == 422
    assert resp.json()["status_code"] == 422


async def test_list_keys_paginated(client, admin_key):
    _, admin_raw = admin_key
    # Create extra keys
    for i in range(3):
        await client.post(
            "/v1/auth/keys",
            headers=_headers(admin_raw),
            json={"name": f"key-{i}", "scopes": ["graphs:read"]},
        )
    resp = await client.get(
        "/v1/auth/keys?limit=2&offset=0", headers=_headers(admin_raw)
    )
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["items"]) == 2
    assert body["total"] >= 4  # admin + 3 created
    assert body["has_more"] is True
    assert body["limit"] == 2
    assert body["offset"] == 0
    # key_hash never exposed
    for k in body["items"]:
        assert "key_hash" not in k


async def test_non_admin_cannot_create_keys_403(client, user_key):
    _, user_raw = user_key
    resp = await client.post(
        "/v1/auth/keys",
        headers=_headers(user_raw),
        json={"name": "nope", "scopes": ["graphs:read"]},
    )
    assert resp.status_code == 403


async def test_revoke_key_then_401(client, admin_key, user_key):
    _, admin_raw = admin_key
    user_obj, user_raw = user_key

    resp = await client.get("/v1/graphs", headers=_headers(user_raw))
    assert resp.status_code == 200

    resp = await client.delete(
        f"/v1/auth/keys/{user_obj.id}", headers=_headers(admin_raw)
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "revoked"

    resp = await client.get("/v1/graphs", headers=_headers(user_raw))
    assert resp.status_code == 401


async def test_revoke_last_admin_key_409(client, admin_key):
    admin_obj, admin_raw = admin_key
    resp = await client.delete(
        f"/v1/auth/keys/{admin_obj.id}", headers=_headers(admin_raw)
    )
    assert resp.status_code == 409
    assert "last admin" in resp.json()["detail"].lower()


# ── Graphs: CRUD + isolation ────────────────────────────────────────────


async def test_create_graph_returns_201(client, user_key):
    _, user_raw = user_key
    resp = await client.post(
        "/v1/graphs",
        headers=_headers(user_raw),
        json={"name": "Test Graph"},
    )
    assert resp.status_code == 201
    assert resp.json()["name"] == "Test Graph"
    assert "id" in resp.json()


async def test_get_graph(client, user_key):
    _, user_raw = user_key
    resp = await client.post(
        "/v1/graphs",
        headers=_headers(user_raw),
        json={"name": "Test Graph"},
    )
    graph_id = resp.json()["id"]

    resp = await client.get(f"/v1/graphs/{graph_id}", headers=_headers(user_raw))
    assert resp.status_code == 200
    assert resp.json()["name"] == "Test Graph"


async def test_list_graphs_paginated(client, user_key):
    _, user_raw = user_key
    for i in range(5):
        await client.post(
            "/v1/graphs",
            headers=_headers(user_raw),
            json={"name": f"G{i}"},
        )
    resp = await client.get("/v1/graphs?limit=3&offset=0", headers=_headers(user_raw))
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["items"]) == 3
    assert body["total"] == 5
    assert body["has_more"] is True

    # Page 2
    resp = await client.get("/v1/graphs?limit=3&offset=3", headers=_headers(user_raw))
    body = resp.json()
    assert len(body["items"]) == 2
    assert body["has_more"] is False


async def test_update_graph(client, user_key):
    _, user_raw = user_key
    resp = await client.post(
        "/v1/graphs",
        headers=_headers(user_raw),
        json={"name": "Old"},
    )
    graph_id = resp.json()["id"]
    resp = await client.put(
        f"/v1/graphs/{graph_id}",
        headers=_headers(user_raw),
        json={"name": "New", "schema_json": {"updated": True}},
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "New"


async def test_delete_graph_returns_204(client, user_key):
    _, user_raw = user_key
    resp = await client.post(
        "/v1/graphs",
        headers=_headers(user_raw),
        json={"name": "ToDelete"},
    )
    graph_id = resp.json()["id"]
    resp = await client.delete(f"/v1/graphs/{graph_id}", headers=_headers(user_raw))
    assert resp.status_code == 204
    assert resp.content == b""

    resp = await client.get(f"/v1/graphs/{graph_id}", headers=_headers(user_raw))
    assert resp.status_code == 404


async def test_owner_isolation(client, admin_key):
    _, admin_raw = admin_key
    db = app.state.db

    key_a, raw_a = await create_test_key(db, name="key-a")
    key_b, raw_b = await create_test_key(db, name="key-b")

    resp = await client.post(
        "/v1/graphs",
        headers=_headers(raw_a),
        json={"name": "A's Graph"},
    )
    assert resp.status_code == 201
    graph_id = resp.json()["id"]

    # B can't see it
    resp = await client.get(f"/v1/graphs/{graph_id}", headers=_headers(raw_b))
    assert resp.status_code == 404

    # B's list is empty
    resp = await client.get("/v1/graphs", headers=_headers(raw_b))
    assert resp.json()["items"] == []

    # Admin sees it
    resp = await client.get("/v1/graphs", headers=_headers(admin_raw))
    assert len(resp.json()["items"]) >= 1


async def test_wrong_scope_403(client):
    db = app.state.db
    key, raw = await create_test_key(db, scopes=["graphs:read"], name="read-only")

    resp = await client.get("/v1/graphs", headers=_headers(raw))
    assert resp.status_code == 200

    resp = await client.post("/v1/graphs", headers=_headers(raw), json={"name": "Nope"})
    assert resp.status_code == 403


async def test_unauthenticated_401(client):
    resp = await client.get("/v1/graphs")
    assert resp.status_code == 401


async def test_invalid_request_body_422(client, user_key):
    _, user_raw = user_key
    resp = await client.post(
        "/v1/graphs",
        headers=_headers(user_raw),
        json={"name": ""},  # min_length=1
    )
    assert resp.status_code == 422
    assert resp.json()["status_code"] == 422
