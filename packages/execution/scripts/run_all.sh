#!/usr/bin/env bash
# Run all manual test scripts for the Phase 2 builder.
# Usage: cd packages/execution && bash scripts/run_all.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

export PYTHONPATH="$PROJECT_DIR:$PYTHONPATH"

echo "=== Manual Test Suite: Phase 2 Builder ==="
echo ""

for script in scripts/test_*.py; do
    echo ">>> Running $script"
    uv run python "$script"
    echo ""
done

echo "=== All manual tests complete ==="
