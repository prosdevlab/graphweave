"""Tests for the migration runner."""

from __future__ import annotations

import sqlite3
import types

import pytest

from app.db.migrations.runner import MigrationError, run_migrations


@pytest.fixture
def db_path(tmp_path):
    return str(tmp_path / "test.db")


def test_fresh_db_creates_tables(db_path):
    run_migrations(db_path)
    conn = sqlite3.connect(db_path)
    # Tables should exist
    tables = {
        row[0]
        for row in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        ).fetchall()
    }
    assert "graphs" in tables
    assert "runs" in tables
    assert "schema_version" in tables

    # Version should be 1
    version = conn.execute("SELECT MAX(version) FROM schema_version").fetchone()[0]
    assert version == 1
    conn.close()


def test_idempotent_run(db_path):
    run_migrations(db_path)
    run_migrations(db_path)  # Should not error

    conn = sqlite3.connect(db_path)
    version = conn.execute("SELECT MAX(version) FROM schema_version").fetchone()[0]
    assert version == 1
    conn.close()


def test_bad_migration_rolls_back(db_path, monkeypatch):
    # First, run the real migrations
    run_migrations(db_path)

    # Create a fake migration module that will fail
    bad_module = types.ModuleType("bad_migration")
    bad_module.VERSION = 2

    def bad_up(db):
        raise RuntimeError("intentional failure")

    bad_module.up = bad_up

    # Patch pkgutil.iter_modules and importlib.import_module to include our bad module
    import app.db.migrations.runner as runner_mod

    original_iter = runner_mod.pkgutil.iter_modules
    original_import = runner_mod.importlib.import_module

    def patched_iter(path):
        yield from original_iter(path)
        info = types.SimpleNamespace(name="002_bad", ispkg=False)
        yield info

    def patched_import(name):
        if name == "app.db.migrations.002_bad":
            return bad_module
        return original_import(name)

    monkeypatch.setattr(runner_mod.pkgutil, "iter_modules", patched_iter)
    monkeypatch.setattr(runner_mod.importlib, "import_module", patched_import)

    with pytest.raises(MigrationError, match="Migration 002 failed"):
        run_migrations(db_path)

    # Version should still be 1 (rollback)
    conn = sqlite3.connect(db_path)
    version = conn.execute("SELECT MAX(version) FROM schema_version").fetchone()[0]
    assert version == 1
    conn.close()
