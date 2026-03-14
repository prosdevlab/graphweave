#!/usr/bin/env bash
# Run all manual test scripts for Phase 2 builder + Phase 3 executor.
# Usage: cd packages/execution && bash tests/manual/run_all.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$PROJECT_DIR"

export PYTHONPATH="$PROJECT_DIR:$PYTHONPATH"

echo "=== Manual Test Suite ==="
echo ""

for script in tests/manual/test_*.py; do
    echo ">>> Running $script"
    uv run python "$script"
    echo ""
done

echo "=== All manual tests complete ==="
