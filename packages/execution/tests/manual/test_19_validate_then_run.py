"""Manual test 19: Validate a valid schema, then run it.

Proves validate and execute agree — a schema that validates
should also run successfully.

Usage: cd packages/execution && uv run python tests/manual/test_19_validate_then_run.py
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


def _schema():
    return {
        "id": "v",
        "name": "Valid",
        "version": 1,
        "state": [
            {"key": "messages", "type": "list", "reducer": "append"},
            {"key": "result", "type": "string", "reducer": "replace"},
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
                "label": "End",
                "position": {"x": 0, "y": 200},
                "config": {},
            },
        ],
        "edges": [
            {"id": "e1", "source": "s", "target": "tool_1"},
            {"id": "e2", "source": "tool_1", "target": "e"},
        ],
        "metadata": {
            "created_at": "2026-01-01",
            "updated_at": "2026-01-01",
        },
    }


async def main():
    print("Test 19: Validate valid schema, then run it")
    print("-" * 50)

    db_path = "/tmp/test_19.db"
    run_migrations(db_path)
    db = await aiosqlite.connect(db_path)
    db.row_factory = aiosqlite.Row
    app.state.db = db
    app.state.run_manager = RunManager()
    _, raw_key = await create_test_key(db, scopes=SCOPES_DEFAULT, name="t19")
    headers = {"X-API-Key": raw_key}

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        # Create graph
        resp = await client.post(
            "/v1/graphs",
            headers=headers,
            json={"name": "Test19", "schema_json": _schema()},
        )
        assert resp.status_code == 201
        gid = resp.json()["id"]
        print(f"\n  Graph created: {gid}")

        # Validate
        resp = await client.post(
            f"/v1/graphs/{gid}/validate",
            headers=headers,
            json={},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["valid"] is True
        assert body["errors"] == []
        print("  Validation: VALID")

        # Run it
        resp = await client.post(
            f"/v1/graphs/{gid}/run",
            headers=headers,
            json={"input": {"result": "2 + 3"}},
        )
        assert resp.status_code == 202
        run_id = resp.json()["run_id"]
        print(f"  Run started: {run_id}")

        # Wait for completion
        for _ in range(50):
            resp = await client.get(
                f"/v1/runs/{run_id}/status",
                headers=headers,
            )
            status = resp.json()["status"]
            if status in ("completed", "error"):
                break
            await asyncio.sleep(0.1)

        print(f"  Run status: {status}")
        assert status == "completed", f"Expected completed, got {status}"

    await app.state.run_manager.cancel_all()
    await db.close()
    os.unlink(db_path)

    print("\n  PASS")


if __name__ == "__main__":
    asyncio.run(main())
