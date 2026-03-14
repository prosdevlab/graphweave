"""Manual test 24: Status filter accuracy.

Creates runs with mixed statuses, filters each,
verifies totals match.

Usage: cd packages/execution && uv run python tests/manual/test_24_status_filter.py
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
    print("Test 24: Status filter accuracy")
    print("-" * 50)

    db_path = "/tmp/test_24.db"
    run_migrations(db_path)
    db = await aiosqlite.connect(db_path)
    db.row_factory = aiosqlite.Row
    app.state.db = db
    app.state.run_manager = RunManager()
    key, raw_key = await create_test_key(db, scopes=SCOPES_DEFAULT, name="t24")
    h = {"X-API-Key": raw_key}

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        resp = await c.post(
            "/v1/graphs",
            headers=h,
            json={"name": "G", "schema_json": {}},
        )
        gid = resp.json()["id"]

        # Insert runs with known statuses
        counts = {
            "completed": 4,
            "error": 2,
            "running": 1,
        }
        for status, n in counts.items():
            for _ in range(n):
                await crud.create_run(db, gid, key.id, status, {})
        total = sum(counts.values())
        print(f"\n  Created {total} runs: {counts}")

        # No filter — all runs
        resp = await c.get(f"/v1/graphs/{gid}/runs", headers=h)
        assert resp.json()["total"] == total
        print(f"  No filter: {resp.json()['total']} (expected {total})")

        # Filter each status
        for status, expected in counts.items():
            resp = await c.get(
                f"/v1/graphs/{gid}/runs?status={status}",
                headers=h,
            )
            body = resp.json()
            assert body["total"] == expected, (
                f"status={status}: expected {expected}, got {body['total']}"
            )
            for item in body["items"]:
                assert item["status"] == status
            print(f"  status={status}: {body['total']} (expected {expected})")

        # Filter for a status with zero runs
        resp = await c.get(
            f"/v1/graphs/{gid}/runs?status=paused",
            headers=h,
        )
        assert resp.json()["total"] == 0
        print("  status=paused: 0 (expected 0)")

    await db.close()
    os.unlink(db_path)

    print("\n  PASS")


if __name__ == "__main__":
    asyncio.run(main())
