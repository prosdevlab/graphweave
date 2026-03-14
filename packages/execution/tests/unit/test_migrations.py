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
    tables = {
        row[0]
        for row in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        ).fetchall()
    }
    assert "graphs" in tables
    assert "runs" in tables
    assert "schema_version" in tables
    assert "api_keys" in tables

    version = conn.execute("SELECT MAX(version) FROM schema_version").fetchone()[0]
    assert version == 2
    conn.close()


def test_idempotent_run(db_path):
    run_migrations(db_path)
    run_migrations(db_path)

    conn = sqlite3.connect(db_path)
    version = conn.execute("SELECT MAX(version) FROM schema_version").fetchone()[0]
    assert version == 2
    conn.close()


def test_bad_migration_rolls_back(db_path, monkeypatch):
    run_migrations(db_path)

    bad_module = types.ModuleType("bad_migration")
    bad_module.VERSION = 3

    def bad_up(db):
        raise RuntimeError("intentional failure")

    bad_module.up = bad_up

    import app.db.migrations.runner as runner_mod

    original_iter = runner_mod.pkgutil.iter_modules
    original_import = runner_mod.importlib.import_module

    def patched_iter(path):
        yield from original_iter(path)
        info = types.SimpleNamespace(name="003_bad", ispkg=False)
        yield info

    def patched_import(name):
        if name == "app.db.migrations.003_bad":
            return bad_module
        return original_import(name)

    monkeypatch.setattr(runner_mod.pkgutil, "iter_modules", patched_iter)
    monkeypatch.setattr(runner_mod.importlib, "import_module", patched_import)

    with pytest.raises(MigrationError, match="Migration 003 failed"):
        run_migrations(db_path)

    conn = sqlite3.connect(db_path)
    version = conn.execute("SELECT MAX(version) FROM schema_version").fetchone()[0]
    assert version == 2
    conn.close()


def test_graphs_table_has_owner_id(db_path):
    run_migrations(db_path)
    conn = sqlite3.connect(db_path)
    columns = {row[1] for row in conn.execute("PRAGMA table_info(graphs)").fetchall()}
    assert "owner_id" in columns
    conn.close()


def test_runs_table_has_owner_id(db_path):
    run_migrations(db_path)
    conn = sqlite3.connect(db_path)
    columns = {row[1] for row in conn.execute("PRAGMA table_info(runs)").fetchall()}
    assert "owner_id" in columns
    conn.close()
