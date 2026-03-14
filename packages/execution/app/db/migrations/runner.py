"""Migration runner — discovers and applies pending migrations at startup."""

from __future__ import annotations

import importlib
import pkgutil
import sqlite3

import app.db.migrations as migrations_pkg


class MigrationError(Exception):
    """A migration failed to apply."""

    def __init__(self, version: int, cause: Exception) -> None:
        self.version = version
        self.cause = cause
        super().__init__(f"Migration {version:03d} failed: {cause}")


def run_migrations(db_path: str) -> None:
    """Discover and apply pending migrations in order.

    Each migration runs inside its own transaction. On failure the
    transaction is rolled back and ``MigrationError`` is raised — the
    server must refuse to start.
    """
    conn = sqlite3.connect(db_path)
    try:
        conn.execute(
            "CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY)"
        )
        conn.commit()

        row = conn.execute("SELECT MAX(version) FROM schema_version").fetchone()
        current_version: int = row[0] or 0

        modules: list[tuple[int, object]] = []
        for info in pkgutil.iter_modules(migrations_pkg.__path__):
            if info.name.startswith("_"):
                continue
            mod = importlib.import_module(f"app.db.migrations.{info.name}")
            if hasattr(mod, "VERSION") and hasattr(mod, "up"):
                modules.append((mod.VERSION, mod))

        modules.sort(key=lambda m: m[0])

        for version, mod in modules:
            if version <= current_version:
                continue
            try:
                conn.execute("BEGIN")
                mod.up(conn)
                conn.execute(
                    "INSERT OR REPLACE INTO schema_version (version) VALUES (?)",
                    (version,),
                )
                conn.commit()
            except Exception as exc:
                conn.rollback()
                raise MigrationError(version, exc) from exc
    finally:
        conn.close()
