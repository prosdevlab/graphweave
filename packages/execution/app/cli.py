"""CLI for API key management.

Usage:
    uv run python -m app.cli create-key --name admin --scopes all
    uv run python -m app.cli list-keys
    uv run python -m app.cli revoke-key KEY_ID
"""

from __future__ import annotations

import argparse
import json
import sqlite3
import sys
import uuid
from datetime import UTC, datetime

from app.auth import SCOPES_ADMIN, validate_scopes
from app.auth.keys import generate_api_key, get_key_display_prefix
from app.db.connection import get_db_path
from app.db.migrations.runner import run_migrations


def _connect(db_path: str) -> sqlite3.Connection:
    """Run migrations and return a sync connection."""
    run_migrations(db_path)
    return sqlite3.connect(db_path)


def _utcnow_iso() -> str:
    return datetime.now(UTC).isoformat()


def cmd_create_key(args: argparse.Namespace) -> None:
    db_path = get_db_path()
    conn = _connect(db_path)

    if args.scopes == "all":
        scopes = SCOPES_ADMIN
    else:
        scopes = [s.strip() for s in args.scopes.split(",")]
        try:
            validate_scopes(scopes)
        except ValueError as exc:
            print(f"Error: {exc}", file=sys.stderr)
            sys.exit(1)

    raw_key, key_hash = generate_api_key()
    prefix = get_key_display_prefix(raw_key)
    key_id = str(uuid.uuid4())
    now = _utcnow_iso()

    conn.execute(
        "INSERT INTO api_keys "
        "(id, name, key_hash, key_prefix, scopes, status, created_at) "
        "VALUES (?, ?, ?, ?, ?, 'active', ?)",
        (key_id, args.name, key_hash, prefix, json.dumps(scopes), now),
    )
    conn.commit()
    conn.close()

    print(f"Created API key: {args.name}")
    print(f"  ID:     {key_id}")
    print(f"  Scopes: {', '.join(scopes)}")
    print(f"  Key:    {raw_key}")
    print()
    print("⚠  Save this key — it will not be shown again.")


def cmd_list_keys(args: argparse.Namespace) -> None:
    db_path = get_db_path()
    conn = _connect(db_path)

    rows = conn.execute(
        "SELECT id, name, key_prefix, scopes, status, created_at, revoked_at "
        "FROM api_keys"
    ).fetchall()
    conn.close()

    if not rows:
        print("No API keys found.")
        return

    for row in rows:
        marker = "✓" if row[4] == "active" else "✗"
        scopes = json.loads(row[3])
        scope_str = ", ".join(scopes)
        print(f"  {marker} {row[2]}...  {row[1]:<20} [{scope_str}]  id={row[0]}")


def cmd_revoke_key(args: argparse.Namespace) -> None:
    db_path = get_db_path()
    conn = _connect(db_path)

    now = _utcnow_iso()
    cursor = conn.execute(
        "UPDATE api_keys SET status = 'revoked', revoked_at = ? WHERE id = ?",
        (now, args.key_id),
    )
    conn.commit()
    conn.close()

    if cursor.rowcount == 0:
        print(f"Key not found: {args.key_id}", file=sys.stderr)
        sys.exit(1)

    print(f"Revoked key: {args.key_id}")


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="app.cli",
        description="GraphWeave API key management",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    create = sub.add_parser("create-key", help="Create a new API key")
    create.add_argument("--name", required=True, help="Key name/label")
    create.add_argument(
        "--scopes",
        required=True,
        help='Comma-separated scopes or "all" for admin',
    )
    create.set_defaults(func=cmd_create_key)

    lst = sub.add_parser("list-keys", help="List all API keys")
    lst.set_defaults(func=cmd_list_keys)

    revoke = sub.add_parser("revoke-key", help="Revoke an API key")
    revoke.add_argument("key_id", help="Key UUID to revoke")
    revoke.set_defaults(func=cmd_revoke_key)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
