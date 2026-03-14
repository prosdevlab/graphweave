"""Auth schema — api_keys table, owner_id on graphs/runs.

⚠️  PRE-PRODUCTION ONLY: This migration drops and recreates tables.
    Future migrations MUST be additive (ALTER TABLE, new tables only).
"""

import logging

VERSION = 2

logger = logging.getLogger(__name__)


def up(db) -> None:
    """Drop and recreate tables with auth support."""
    logger.warning(
        "Migration 002: Dropping and recreating graphs/runs tables. "
        "All existing graph and run data will be lost."
    )

    db.execute("DROP TABLE IF EXISTS runs")
    db.execute("DROP TABLE IF EXISTS graphs")

    db.execute("""
        CREATE TABLE api_keys (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            key_hash TEXT NOT NULL UNIQUE,
            key_prefix TEXT NOT NULL,
            scopes TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'active',
            created_at TEXT NOT NULL,
            revoked_at TEXT
        )
    """)
    db.execute("CREATE INDEX idx_api_keys_hash ON api_keys(key_hash)")

    db.execute("""
        CREATE TABLE graphs (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            schema_json TEXT NOT NULL,
            owner_id TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
    """)
    db.execute("CREATE INDEX idx_graphs_owner ON graphs(owner_id)")

    db.execute("""
        CREATE TABLE runs (
            id TEXT PRIMARY KEY,
            graph_id TEXT NOT NULL,
            owner_id TEXT NOT NULL,
            status TEXT NOT NULL,
            input_json TEXT,
            final_state_json TEXT,
            duration_ms INTEGER,
            created_at TEXT NOT NULL,
            error TEXT,
            paused_node_id TEXT,
            paused_prompt TEXT,
            FOREIGN KEY (graph_id) REFERENCES graphs(id)
        )
    """)
    db.execute("CREATE INDEX idx_runs_owner ON runs(owner_id)")
    db.execute("CREATE INDEX idx_runs_graph ON runs(graph_id)")
