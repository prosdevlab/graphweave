"""Manual test 25: Cancel a paused run via API.

Full flow: start → pause at human_input → cancel → verify error
in SSE buffer and DB status.

Usage: cd packages/execution && uv run python tests/manual/test_25_cancel_paused.py
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


def _pause_schema():
    return {
        "id": "pause",
        "name": "Pause",
        "version": 1,
        "state": [
            {
                "key": "messages",
                "type": "list",
                "reducer": "append",
            },
            {
                "key": "answer",
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
                "id": "ask",
                "type": "human_input",
                "label": "Ask",
                "position": {"x": 0, "y": 100},
                "config": {
                    "prompt": "Continue?",
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


async def main():
    print("Test 25: Cancel a paused run via API")
    print("-" * 50)

    db_path = "/tmp/test_25.db"
    run_migrations(db_path)
    db = await aiosqlite.connect(db_path)
    db.row_factory = aiosqlite.Row
    app.state.db = db
    app.state.run_manager = RunManager()
    _, raw_key = await create_test_key(db, scopes=SCOPES_DEFAULT, name="t25")
    h = {"X-API-Key": raw_key}

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        # Create graph and start run
        resp = await c.post(
            "/v1/graphs",
            headers=h,
            json={
                "name": "Pause",
                "schema_json": _pause_schema(),
            },
        )
        gid = resp.json()["id"]

        resp = await c.post(
            f"/v1/graphs/{gid}/run",
            headers=h,
            json={},
        )
        run_id = resp.json()["run_id"]
        print(f"\n  Run started: {run_id}")

        # Wait for pause
        for _ in range(50):
            resp = await c.get(f"/v1/runs/{run_id}/status", headers=h)
            if resp.json()["status"] == "paused":
                break
            await asyncio.sleep(0.1)

        status = resp.json()
        assert status["status"] == "paused"
        print(f"  Status: {status['status']}")
        print(f"  Paused at: {status.get('node_id')}")
        print(f"  Prompt: {status.get('prompt')}")

        # Cancel
        resp = await c.post(
            f"/v1/runs/{run_id}/cancel",
            headers=h,
            json={},
        )
        assert resp.status_code == 202
        print(f"\n  Cancel response: {resp.json()['detail']}")

        # Wait for the executor to process cancellation
        await asyncio.sleep(0.5)

        # Check final status
        resp = await c.get(f"/v1/runs/{run_id}/status", headers=h)
        final = resp.json()
        print(f"  Final status: {final['status']}")
        # Status should be "error" (cancelled runs become errors)
        assert final["status"] == "error"

        # Verify in run history
        resp = await c.get(f"/v1/graphs/{gid}/runs", headers=h)
        runs = resp.json()["items"]
        assert len(runs) == 1
        assert runs[0]["status"] == "error"
        print("  Appears in history as error: yes")

    await app.state.run_manager.cancel_all()
    await db.close()
    os.unlink(db_path)

    print("\n  PASS")


if __name__ == "__main__":
    asyncio.run(main())
