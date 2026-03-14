"""Manual test 23: Pagination through run history.

Creates many runs, pages through with offset/limit,
verifies no duplicates and correct totals.

Usage: cd packages/execution && uv run python tests/manual/test_23_pagination.py
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
    print("Test 23: Pagination through run history")
    print("-" * 50)

    db_path = "/tmp/test_23.db"
    run_migrations(db_path)
    db = await aiosqlite.connect(db_path)
    db.row_factory = aiosqlite.Row
    app.state.db = db
    app.state.run_manager = RunManager()
    key, raw_key = await create_test_key(db, scopes=SCOPES_DEFAULT, name="t23")
    h = {"X-API-Key": raw_key}

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        resp = await c.post(
            "/v1/graphs",
            headers=h,
            json={"name": "G", "schema_json": {}},
        )
        gid = resp.json()["id"]

        # Insert 12 runs directly
        for i in range(12):
            await crud.create_run(db, gid, key.id, "completed", {"i": i})
        print(f"\n  Created 12 runs for graph {gid[:8]}...")

        # Page 1: limit=5, offset=0
        resp = await c.get(
            f"/v1/graphs/{gid}/runs?limit=5&offset=0",
            headers=h,
        )
        p1 = resp.json()
        assert len(p1["items"]) == 5
        assert p1["total"] == 12
        assert p1["has_more"] is True
        print(
            f"  Page 1: {len(p1['items'])} items, "
            f"total={p1['total']}, has_more={p1['has_more']}"
        )

        # Page 2: limit=5, offset=5
        resp = await c.get(
            f"/v1/graphs/{gid}/runs?limit=5&offset=5",
            headers=h,
        )
        p2 = resp.json()
        assert len(p2["items"]) == 5
        assert p2["total"] == 12
        assert p2["has_more"] is True
        print(
            f"  Page 2: {len(p2['items'])} items, "
            f"total={p2['total']}, has_more={p2['has_more']}"
        )

        # Page 3: limit=5, offset=10
        resp = await c.get(
            f"/v1/graphs/{gid}/runs?limit=5&offset=10",
            headers=h,
        )
        p3 = resp.json()
        assert len(p3["items"]) == 2
        assert p3["total"] == 12
        assert p3["has_more"] is False
        print(
            f"  Page 3: {len(p3['items'])} items, "
            f"total={p3['total']}, has_more={p3['has_more']}"
        )

        # Verify no duplicates across pages
        all_ids = (
            [i["id"] for i in p1["items"]]
            + [i["id"] for i in p2["items"]]
            + [i["id"] for i in p3["items"]]
        )
        assert len(all_ids) == 12
        assert len(set(all_ids)) == 12, "Duplicate run IDs!"
        print("  All 12 unique IDs collected across 3 pages")

    await db.close()
    os.unlink(db_path)

    print("\n  PASS")


if __name__ == "__main__":
    asyncio.run(main())
