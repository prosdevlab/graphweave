#!/usr/bin/env bash
set -euo pipefail

# Context-efficient backpressure wrapper.
# Success: prints a single summary line with test counts (if applicable).
# Failure: prints filtered output (no ANSI, no noise).
# Bypass:  VERBOSE=1 ./scripts/run_silent.sh <command>

if [ "${VERBOSE:-}" = "1" ]; then
  exec "$@"
fi

LABEL="$*"
TMPFILE=$(mktemp)
trap 'rm -f "$TMPFILE"' EXIT INT TERM
SECONDS=0

set +e
"$@" > "$TMPFILE" 2>&1
EXIT_CODE=$?
set -e

ELAPSED="${SECONDS}s"

if [ $EXIT_CODE -eq 0 ]; then
  # Extract framework-specific test counts for a compact summary
  SUMMARY=""

  # vitest: "Test Files  3 passed (3)"
  if grep -qE "Test Files.*passed" "$TMPFILE" 2>/dev/null; then
    COUNT=$(grep -oE "[0-9]+ passed" "$TMPFILE" | head -1 | awk '{print $1}')
    [ -n "$COUNT" ] && SUMMARY="${COUNT} test files, "

  # pytest: "8 passed in 1.23s"
  elif grep -qE "[0-9]+ passed" "$TMPFILE" 2>/dev/null; then
    COUNT=$(grep -oE "[0-9]+ passed" "$TMPFILE" | tail -1 | awk '{print $1}')
    [ -n "$COUNT" ] && SUMMARY="${COUNT} tests, "
  fi

  printf "✓ %s (%s%s)\n" "$LABEL" "$SUMMARY" "$ELAPSED"
else
  printf "✗ %s (exit %d, %s)\n" "$LABEL" "$EXIT_CODE" "$ELAPSED"
  echo "---"
  # Filter noise: ANSI codes, blank lines, node_modules frames, timing/cache lines
  sed 's/\x1b\[[0-9;]*m//g' "$TMPFILE" \
    | grep -v '^\s*$' \
    | grep -v '^\s*at .*/node_modules/' \
    | grep -v '^  Duration' \
    | grep -v '^ Tasks:' \
    | grep -v '^  Cache:' \
    || true
  echo "---"
fi

exit $EXIT_CODE
