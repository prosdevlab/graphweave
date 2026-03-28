#!/usr/bin/env bash
set -euo pipefail

# PostToolUse hook: auto-lints files after Write/Edit.
# If lint fails, blocks Claude with errors so it self-corrects.
# If lint passes, exits silently (no context waste).

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path')

# Skip if no file path or null
[ -z "$FILE_PATH" ] || [ "$FILE_PATH" = "null" ] && exit 0

# Skip files outside the project
[[ "$FILE_PATH" == "$CLAUDE_PROJECT_DIR/"* ]] || exit 0

# Skip non-existent files (e.g. after a failed write)
[ -f "$FILE_PATH" ] || exit 0

EXTENSION="${FILE_PATH##*.}"
LINT_OUTPUT=""
LINT_EXIT=0

case "$EXTENSION" in
  ts|tsx|js|jsx|json|css)
    LINT_OUTPUT=$(biome check --write "$FILE_PATH" 2>&1) || LINT_EXIT=$?
    ;;
  py)
    LINT_OUTPUT=$(
      cd "$CLAUDE_PROJECT_DIR/packages/execution" \
        && uv run ruff check --fix "$FILE_PATH" 2>&1 \
        && uv run ruff format "$FILE_PATH" 2>&1
    ) || LINT_EXIT=$?
    ;;
  *)
    exit 0
    ;;
esac

if [ $LINT_EXIT -ne 0 ]; then
  # Strip ANSI codes and send errors back to Claude
  CLEAN_OUTPUT=$(echo "$LINT_OUTPUT" | sed 's/\x1b\[[0-9;]*m//g')
  jq -n --arg reason "$CLEAN_OUTPUT" '{"decision": "block", "reason": $reason}'
  exit 0
fi

# Lint passed — exit silently
exit 0
