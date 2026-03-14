"""Manual test 26: Cancel stale DB run.

Inserts a "running" run directly in DB (simulating server restart),
cancels via API, verifies DB updated to error.

Usage: cd packages/execution && uv run python tests/manual/test_26_cancel_stale.py
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
    print("Test 26: Cancel stale DB run")
    print("-" * 50)

    db_path = "/tmp/test_26.db"
    run_migrations(db_path)
    db = await aiosqlite.connect(db_path)
    db.row_factory = aiosqlite.Row
    app.state.db = db
    app.state.run_manager = RunManager()
    key, raw_key = await create_test_key(db, scopes=SCOPES_DEFAULT, name="t26")
    h = {"X-API-Key": raw_key}

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        resp = await c.post(
            "/v1/graphs",
            headers=h,
            json={"name": "G", "schema_json": {}},
        )
        gid = resp.json()["id"]

        # Insert run as "running" directly in DB (not in RunManager)
        run = await crud.create_run(db, gid, key.id, "running", {})
        print(f"\n  Stale run in DB: {run.id}")
        print(f"  DB status: {run.status}")
        print(f"  In RunManager: {app.state.run_manager.get_run(run.id) is not None}")

        # Cancel via API
        resp = await c.post(
            f"/v1/runs/{run.id}/cancel",
            headers=h,
            json={},
        )
        assert resp.status_code == 202
        print(f"\n  Cancel response: {resp.status_code}")

        # Verify DB updated
        updated = await crud.get_run(db, run.id)
        assert updated.status == "error"
        assert "server lost" in updated.error.lower()
        print(f"  DB status now: {updated.status}")
        print(f"  DB error: {updated.error}")

        # Also test cancelling an already-completed run → 409
        done = await crud.create_run(db, gid, key.id, "completed", {})
        resp = await c.post(
            f"/v1/runs/{done.id}/cancel",
            headers=h,
            json={},
        )
        assert resp.status_code == 409
        print(f"\n  Cancel completed run: {resp.status_code} (expected 409)")

    await db.close()
    os.unlink(db_path)

    print("\n  PASS")


if __name__ == "__main__":
    asyncio.run(main())
