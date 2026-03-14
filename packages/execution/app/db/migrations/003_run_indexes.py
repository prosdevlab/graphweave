"""Run query indexes for Phase 4 run history."""

VERSION = 3


def up(db) -> None:
    db.execute(
        "CREATE INDEX IF NOT EXISTS idx_runs_graph_owner_status "
        "ON runs(graph_id, owner_id, status)"
    )
    db.execute(
        "CREATE INDEX IF NOT EXISTS idx_runs_owner_status ON runs(owner_id, status)"
    )
    db.execute("CREATE INDEX IF NOT EXISTS idx_runs_created ON runs(created_at)")
