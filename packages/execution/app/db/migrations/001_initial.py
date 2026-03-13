"""Initial schema — graphs and runs tables."""

VERSION = 1


def up(db) -> None:
    """Create initial tables."""
    db.execute("""
        CREATE TABLE IF NOT EXISTS graphs (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            schema_json TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
    """)
    db.execute("""
        CREATE TABLE IF NOT EXISTS runs (
            id TEXT PRIMARY KEY,
            graph_id TEXT NOT NULL,
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
    db.execute("""
        CREATE TABLE IF NOT EXISTS schema_version (
            version INTEGER PRIMARY KEY
        )
    """)
    db.execute("INSERT OR IGNORE INTO schema_version (version) VALUES (1)")
