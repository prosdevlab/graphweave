"""Manual test 21: Export returns 501 gracefully.

Usage: cd packages/execution && uv run python tests/manual/test_21_export_stub.py
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
    print("Test 21: Export returns 501 gracefully")
    print("-" * 50)

    db_path = "/tmp/test_21.db"
    run_migrations(db_path)
    db = await aiosqlite.connect(db_path)
    db.row_factory = aiosqlite.Row
    app.state.db = db
    app.state.run_manager = RunManager()
    _, raw_key = await create_test_key(db, scopes=SCOPES_DEFAULT, name="t21")
    headers = {"X-API-Key": raw_key}

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post(
            "/v1/graphs",
            headers=headers,
            json={"name": "G", "schema_json": {}},
        )
        gid = resp.json()["id"]

        resp = await client.get(f"/v1/graphs/{gid}/export", headers=headers)
        assert resp.status_code == 501
        body = resp.json()
        assert "not implemented" in body["detail"].lower()
        print(f"\n  Status: {resp.status_code}")
        print(f"  Detail: {body['detail']}")

        # Not-found still returns 404, not 501
        resp = await client.get("/v1/graphs/missing/export", headers=headers)
        assert resp.status_code == 404
        print(f"  Missing graph: {resp.status_code}")

    await db.close()
    os.unlink(db_path)

    print("\n  PASS")


if __name__ == "__main__":
    asyncio.run(main())
