"""Manual test 29: Full lifecycle — validate → run → history → cancel → delete.

Single test hitting every Phase 4 route in a realistic sequence.

Usage: cd packages/execution && uv run python tests/manual/test_29_full_lifecycle.py
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
            {
                "key": "messages",
                "type": "list",
                "reducer": "append",
            },
            {
                "key": "result",
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


async def main():
    print("Test 29: Full lifecycle")
    print("-" * 50)

    db_path = "/tmp/test_29.db"
    run_migrations(db_path)
    db = await aiosqlite.connect(db_path)
    db.row_factory = aiosqlite.Row
    app.state.db = db
    app.state.run_manager = RunManager()
    _, raw_key = await create_test_key(db, scopes=SCOPES_DEFAULT, name="t29")
    h = {"X-API-Key": raw_key}

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        # Step 1: Create graph
        resp = await c.post(
            "/v1/graphs",
            headers=h,
            json={
                "name": "Lifecycle",
                "schema_json": _calc_schema(),
            },
        )
        gid = resp.json()["id"]
        print(f"\n  1. Graph created: {gid[:8]}...")

        # Step 2: Validate
        resp = await c.post(
            f"/v1/graphs/{gid}/validate",
            headers=h,
            json={},
        )
        assert resp.status_code == 200
        assert resp.json()["valid"] is True
        print("  2. Validate: VALID")

        # Step 3: Export (501)
        resp = await c.get(f"/v1/graphs/{gid}/export", headers=h)
        assert resp.status_code == 501
        print("  3. Export: 501 (stub)")

        # Step 4: Run and complete
        resp = await c.post(
            f"/v1/graphs/{gid}/run",
            headers=h,
            json={"input": {"result": "7 * 8"}},
        )
        run1 = resp.json()["run_id"]
        for _ in range(50):
            resp = await c.get(f"/v1/runs/{run1}/status", headers=h)
            if resp.json()["status"] == "completed":
                break
            await asyncio.sleep(0.1)
        assert resp.json()["status"] == "completed"
        print(f"  4. Run completed: {run1[:8]}...")

        # Step 5: Check history (1 run)
        resp = await c.get(f"/v1/graphs/{gid}/runs", headers=h)
        assert resp.json()["total"] == 1
        print(f"  5. History: {resp.json()['total']} run(s)")

        # Step 6: Global list
        resp = await c.get("/v1/runs", headers=h)
        assert resp.json()["total"] >= 1
        print(f"  6. Global runs: {resp.json()['total']}")

        # Step 7: Create pause graph, run, cancel
        resp = await c.post(
            "/v1/graphs",
            headers=h,
            json={
                "name": "PauseG",
                "schema_json": _pause_schema(),
            },
        )
        pgid = resp.json()["id"]
        resp = await c.post(
            f"/v1/graphs/{pgid}/run",
            headers=h,
            json={},
        )
        run2 = resp.json()["run_id"]
        for _ in range(50):
            resp = await c.get(f"/v1/runs/{run2}/status", headers=h)
            if resp.json()["status"] == "paused":
                break
            await asyncio.sleep(0.1)
        resp = await c.post(
            f"/v1/runs/{run2}/cancel",
            headers=h,
            json={},
        )
        assert resp.status_code == 202
        print("  7. Cancel paused run: 202")
        await asyncio.sleep(0.5)

        # Step 8: Delete completed run
        resp = await c.delete(f"/v1/runs/{run1}", headers=h)
        assert resp.status_code == 204
        print("  8. Delete completed run: 204")

        # Step 9: Delete cancelled run
        resp = await c.delete(f"/v1/runs/{run2}", headers=h)
        assert resp.status_code == 204
        print("  9. Delete cancelled run: 204")

        # Step 10: Verify history is clean
        resp = await c.get("/v1/runs", headers=h)
        assert resp.json()["total"] == 0
        print(f"  10. Global runs after cleanup: {resp.json()['total']}")

    await app.state.run_manager.cancel_all()
    await db.close()
    os.unlink(db_path)

    print("\n  PASS")


if __name__ == "__main__":
    asyncio.run(main())
