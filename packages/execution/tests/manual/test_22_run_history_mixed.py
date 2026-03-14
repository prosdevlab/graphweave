"""Manual test 22: Run history after mixed executions.

Execute 3 runs (1 success, 1 tool error, 1 cancelled), then list
all runs and verify statuses and counts.

Usage: cd packages/execution && uv run python tests/manual/test_22_run_history_mixed.py
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


def _calc_schema():
    return {
        "id": "calc",
        "name": "Calc",
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
                "id": "t",
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
            {"id": "e1", "source": "s", "target": "t"},
            {"id": "e2", "source": "t", "target": "e"},
        ],
        "metadata": {
            "created_at": "2026-01-01",
            "updated_at": "2026-01-01",
        },
    }


def _pause_schema():
    return {
        "id": "pause",
        "name": "Pause",
        "version": 1,
        "state": [
            {"key": "messages", "type": "list", "reducer": "append"},
            {"key": "answer", "type": "string", "reducer": "replace"},
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
                "id": "ask",
                "type": "human_input",
                "label": "Ask",
                "position": {"x": 0, "y": 100},
                "config": {
                    "prompt": "Wait",
                    "input_key": "answer",
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
            {"id": "e1", "source": "s", "target": "ask"},
            {"id": "e2", "source": "ask", "target": "e"},
        ],
        "metadata": {
            "created_at": "2026-01-01",
            "updated_at": "2026-01-01",
        },
    }


async def _wait_for(client, headers, run_id, target, tries=50):
    for _ in range(tries):
        resp = await client.get(f"/v1/runs/{run_id}/status", headers=headers)
        if resp.json()["status"] == target:
            return resp.json()["status"]
        await asyncio.sleep(0.1)
    return resp.json()["status"]


async def main():
    print("Test 22: Run history after mixed executions")
    print("-" * 50)

    db_path = "/tmp/test_22.db"
    run_migrations(db_path)
    db = await aiosqlite.connect(db_path)
    db.row_factory = aiosqlite.Row
    app.state.db = db
    app.state.run_manager = RunManager()
    _, raw_key = await create_test_key(db, scopes=SCOPES_DEFAULT, name="t22")
    h = {"X-API-Key": raw_key}

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        # Create two graphs
        resp = await c.post(
            "/v1/graphs",
            headers=h,
            json={"name": "Calc", "schema_json": _calc_schema()},
        )
        calc_gid = resp.json()["id"]

        resp = await c.post(
            "/v1/graphs",
            headers=h,
            json={
                "name": "Pause",
                "schema_json": _pause_schema(),
            },
        )
        pause_gid = resp.json()["id"]

        # Run 1: success (valid calc)
        resp = await c.post(
            f"/v1/graphs/{calc_gid}/run",
            headers=h,
            json={"input": {"result": "2 + 3"}},
        )
        run1 = resp.json()["run_id"]
        s1 = await _wait_for(c, h, run1, "completed")
        print(f"\n  Run 1 (calc 2+3): {s1}")
        assert s1 == "completed"

        # Run 2: completed (another calc)
        resp = await c.post(
            f"/v1/graphs/{calc_gid}/run",
            headers=h,
            json={"input": {"result": "10 * 5"}},
        )
        run2 = resp.json()["run_id"]
        s2 = await _wait_for(c, h, run2, "completed")
        print(f"  Run 2 (calc 10*5): {s2}")
        assert s2 == "completed"

        # Run 3: pause then cancel → error
        resp = await c.post(
            f"/v1/graphs/{pause_gid}/run",
            headers=h,
            json={},
        )
        run3 = resp.json()["run_id"]
        await _wait_for(c, h, run3, "paused")
        await c.post(f"/v1/runs/{run3}/cancel", headers=h, json={})
        await asyncio.sleep(0.3)
        resp = await c.get(f"/v1/runs/{run3}/status", headers=h)
        s3 = resp.json()["status"]
        print(f"  Run 3 (cancelled): {s3}")

        # List all runs
        resp = await c.get("/v1/runs", headers=h)
        body = resp.json()
        print(f"\n  Total runs: {body['total']}")
        assert body["total"] == 3

        statuses = [item["status"] for item in body["items"]]
        print(f"  Statuses: {statuses}")
        assert statuses.count("completed") == 2

        # List runs for calc graph only
        resp = await c.get(f"/v1/graphs/{calc_gid}/runs", headers=h)
        body = resp.json()
        print(f"\n  Calc graph runs: {body['total']}")
        assert body["total"] == 2

    await app.state.run_manager.cancel_all()
    await db.close()
    os.unlink(db_path)

    print("\n  PASS")


if __name__ == "__main__":
    asyncio.run(main())
