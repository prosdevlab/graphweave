"""Manual test 27: Delete completed run, verify gone.

Run a graph, complete it, delete, verify not in history.

Usage: cd packages/execution && uv run python tests/manual/test_27_delete_completed.py
"""

import asyncio
import os

import aiosqlite
import httpx

from app.auth import SCOPES_DEFAULT
from app.db import crud
from app.db.migrations.runner import run_migrations
from app.executor import RunManager
from app.main import app
from tests.conftest import create_test_key

os.environ.setdefault("RUN_CLEANUP_GRACE_SECONDS", "0")
os.environ.setdefault("OPENAI_API_KEY", "sk-test-dummy")


async def main():
    print("Test 27: Delete completed run, verify gone")
    print("-" * 50)

    db_path = "/tmp/test_27.db"
    run_migrations(db_path)
    db = await aiosqlite.connect(db_path)
    db.row_factory = aiosqlite.Row
    app.state.db = db
    app.state.run_manager = RunManager()
    key, raw_key = await create_test_key(db, scopes=SCOPES_DEFAULT, name="t27")
    h = {"X-API-Key": raw_key}

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        resp = await c.post(
            "/v1/graphs",
            headers=h,
            json={"name": "G", "schema_json": {}},
        )
        gid = resp.json()["id"]

        # Insert a completed run
        run = await crud.create_run(db, gid, key.id, "completed", {"x": 1})
        print(f"\n  Completed run: {run.id}")

        # Verify it's in history
        resp = await c.get(f"/v1/graphs/{gid}/runs", headers=h)
        assert resp.json()["total"] == 1
        print("  In history: yes")

        # Delete it
        resp = await c.delete(f"/v1/runs/{run.id}", headers=h)
        assert resp.status_code == 204
        print(f"  Delete: {resp.status_code}")

        # Verify gone from history
        resp = await c.get(f"/v1/graphs/{gid}/runs", headers=h)
        assert resp.json()["total"] == 0
        print("  In history after delete: no")

        # Verify status returns 404
        resp = await c.get(f"/v1/runs/{run.id}/status", headers=h)
        assert resp.status_code == 404
        print(f"  Status after delete: {resp.status_code}")

        # Delete non-existent → 404
        resp = await c.delete(f"/v1/runs/{run.id}", headers=h)
        assert resp.status_code == 404
        print(f"  Delete again: {resp.status_code} (idempotent)")

    await db.close()
    os.unlink(db_path)

    print("\n  PASS")


if __name__ == "__main__":
    asyncio.run(main())
