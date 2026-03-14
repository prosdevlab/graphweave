"""Manual test 37: Export route end-to-end — hit real API, verify response.

Usage: cd packages/execution && uv run python tests/manual/test_37_export_route.py
"""

import asyncio
import os

import aiosqlite
import httpx

from app.auth import SCOPES_DEFAULT
from app.db.migrations.runner import run_migrations
from app.main import app
from tests.conftest import create_test_key

os.environ.setdefault("OPENAI_API_KEY", "sk-test-dummy-key")


def _schema():
    return {
        "id": "route_test",
        "name": "RouteTest",
        "version": 1,
        "state": [
            {"key": "messages", "type": "list", "reducer": "append"},
            {"key": "result", "type": "string", "reducer": "replace"},
        ],
        "nodes": [
            {
                "id": "s",
                "type": "start",
                "label": "S",
                "position": {"x": 0, "y": 0},
                "config": {},
            },
            {
                "id": "tool_1",
                "type": "tool",
                "label": "Calc",
                "position": {"x": 0, "y": 100},
                "config": {
                    "tool_name": "calculator",
                    "input_map": {"expression": "result"},
                    "output_key": "result",
                },
            },
            {
                "id": "e",
                "type": "end",
                "label": "E",
                "position": {"x": 0, "y": 200},
                "config": {},
            },
        ],
        "edges": [
            {"id": "e1", "source": "s", "target": "tool_1"},
            {"id": "e2", "source": "tool_1", "target": "e"},
        ],
        "metadata": {},
    }


async def main():
    print("── Test 37: Export route end-to-end ──")

    db_path = "/tmp/test_export_route.db"
    if os.path.exists(db_path):
        os.unlink(db_path)
    run_migrations(db_path)
    db = await aiosqlite.connect(db_path)
    db.row_factory = aiosqlite.Row
    app.state.db = db

    _, raw = await create_test_key(db, scopes=SCOPES_DEFAULT, name="user")
    headers = {"X-API-Key": raw}

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        # Create graph
        resp = await client.post(
            "/v1/graphs",
            headers=headers,
            json={"name": "ExportTest", "schema_json": _schema()},
        )
        assert resp.status_code == 201
        gid = resp.json()["id"]
        print(f"  ✓ Created graph {gid}")

        # Export
        resp = await client.get(f"/v1/graphs/{gid}/export", headers=headers)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        body = resp.json()
        assert "code" in body
        assert "requirements" in body
        assert "class GraphState(TypedDict):" in body["code"]
        assert "langgraph" in body["requirements"]
        print(f"  ✓ Export returned 200 with {len(body['code'])} chars of code")

        # Verify code compiles
        compile(body["code"], "<export>", "exec")
        print("  ✓ Generated code compiles")

        # 404 for nonexistent
        resp = await client.get("/v1/graphs/nonexistent/export", headers=headers)
        assert resp.status_code == 404
        print("  ✓ 404 for nonexistent graph")

    await db.close()
    os.unlink(db_path)
    print("\n✅ All export route tests passed")


if __name__ == "__main__":
    asyncio.run(main())
