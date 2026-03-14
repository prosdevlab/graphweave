"""Manual test 20: Validate catches multiple error types.

Tests structural (missing start), semantic (unknown tool),
and graph-not-found errors.

Usage: cd packages/execution && uv run python tests/manual/test_20_validate_errors.py
"""

import asyncio
import os

import aiosqlite
import httpx

from app.auth import SCOPES_DEFAULT
from app.db.migrations.runner import run_migrations
from app.executor import RunManager
from app.main import app
from tests.conftest import create_test_key

os.environ.setdefault("RUN_CLEANUP_GRACE_SECONDS", "0")
os.environ.setdefault("OPENAI_API_KEY", "sk-test-dummy")


async def main():
    print("Test 20: Validate catches multiple error types")
    print("-" * 50)

    db_path = "/tmp/test_20.db"
    run_migrations(db_path)
    db = await aiosqlite.connect(db_path)
    db.row_factory = aiosqlite.Row
    app.state.db = db
    app.state.run_manager = RunManager()
    _, raw_key = await create_test_key(db, scopes=SCOPES_DEFAULT, name="t20")
    headers = {"X-API-Key": raw_key}

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Missing start node
        print("\n  Case 1: Missing start node")
        no_start = {
            "id": "bad",
            "name": "Bad",
            "version": 1,
            "state": [
                {
                    "key": "x",
                    "type": "string",
                    "reducer": "replace",
                },
            ],
            "nodes": [
                {
                    "id": "e",
                    "type": "end",
                    "label": "End",
                    "position": {"x": 0, "y": 0},
                    "config": {},
                },
            ],
            "edges": [],
            "metadata": {
                "created_at": "2026-01-01",
                "updated_at": "2026-01-01",
            },
        }
        resp = await client.post(
            "/v1/graphs",
            headers=headers,
            json={"name": "NoStart", "schema_json": no_start},
        )
        gid = resp.json()["id"]
        resp = await client.post(
            f"/v1/graphs/{gid}/validate",
            headers=headers,
            json={},
        )
        assert resp.status_code == 422
        body = resp.json()
        assert body["valid"] is False
        assert len(body["errors"]) >= 1
        print(f"    Status: 422, Error: {body['errors'][0]['message'][:60]}")

        # 2. Unknown tool
        print("\n  Case 2: Unknown tool name")
        bad_tool = {
            "id": "bt",
            "name": "BadTool",
            "version": 1,
            "state": [
                {
                    "key": "messages",
                    "type": "list",
                    "reducer": "append",
                },
                {
                    "key": "out",
                    "type": "string",
                    "reducer": "replace",
                },
            ],
            "nodes": [
                {
                    "id": "s",
                    "type": "start",
                    "label": "Start",
                    "position": {"x": 0, "y": 0},
                    "config": {},
                },
                {
                    "id": "t",
                    "type": "tool",
                    "label": "Ghost",
                    "position": {"x": 0, "y": 100},
                    "config": {
                        "tool_name": "ghost_tool",
                        "input_map": {"x": "messages"},
                        "output_key": "out",
                    },
                },
                {
                    "id": "e",
                    "type": "end",
                    "label": "End",
                    "position": {"x": 0, "y": 200},
                    "config": {},
                },
            ],
            "edges": [
                {"id": "e1", "source": "s", "target": "t"},
                {"id": "e2", "source": "t", "target": "e"},
            ],
            "metadata": {
                "created_at": "2026-01-01",
                "updated_at": "2026-01-01",
            },
        }
        resp = await client.post(
            "/v1/graphs",
            headers=headers,
            json={"name": "BadTool", "schema_json": bad_tool},
        )
        gid2 = resp.json()["id"]
        resp = await client.post(
            f"/v1/graphs/{gid2}/validate",
            headers=headers,
            json={},
        )
        assert resp.status_code == 422
        body = resp.json()
        assert body["valid"] is False
        assert body["errors"][0].get("node_ref") == "t"
        print(
            f"    Status: 422, node_ref: {body['errors'][0]['node_ref']}, "
            f"Error: {body['errors'][0]['message'][:50]}"
        )

        # 3. Graph not found
        print("\n  Case 3: Graph not found")
        resp = await client.post(
            "/v1/graphs/nonexistent/validate",
            headers=headers,
            json={},
        )
        assert resp.status_code == 404
        print("    Status: 404")

    await db.close()
    os.unlink(db_path)

    print("\n  PASS")


if __name__ == "__main__":
    asyncio.run(main())
