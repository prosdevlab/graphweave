#!/usr/bin/env bash
set -euo pipefail

# PreToolUse hook: intercepts test/lint/build Bash commands,
# wraps them in run_silent.sh, and injects fail-fast flags.
# Non-matching commands pass through untouched.

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command')
TIMEOUT=$(echo "$INPUT" | jq -r '.tool_input.timeout // 120000')
DESC=$(echo "$INPUT" | jq -r '.tool_input.description // ""')
RUN_SILENT="$CLAUDE_PROJECT_DIR/scripts/run_silent.sh"

# --- Skip: compound commands and shell metacharacters ---
if [[ "$COMMAND" == *"&&"* ]] || [[ "$COMMAND" == *"||"* ]] || [[ "$COMMAND" == *";"* ]] \
  || [[ "$COMMAND" == *'$('* ]] || [[ "$COMMAND" == *'`'* ]] || [[ "$COMMAND" == *"|"* ]] \
  || [[ "$COMMAND" == *">("* ]] || [[ "$COMMAND" == *"<("* ]] \
  || [[ "$COMMAND" == *">"* ]] || [[ "$COMMAND" == *"<"* ]]; then
  exit 0
fi

# --- Skip: interactive, dev, install, git, docker ---
case "$COMMAND" in
  git\ *|docker\ *|docker-compose\ *)     exit 0 ;;
  pnpm\ dev*|pnpm\ run\ dev*|pnpm\ add*) exit 0 ;;
  pnpm\ install*|pnpm\ i\ *|pnpm\ i)     exit 0 ;;
  uv\ add*|uv\ sync*|uv\ pip*)           exit 0 ;;
  cd\ *|ls*|cat\ *|echo\ *|which\ *|pwd*) exit 0 ;;
  mkdir\ *|rm\ *|cp\ *|mv\ *|chmod\ *)    exit 0 ;;
  gh\ *|curl\ *|wget\ *)                  exit 0 ;;
esac

# Skip anything with --watch or --interactive
if [[ "$COMMAND" == *"--watch"* ]] || [[ "$COMMAND" == *"--interactive"* ]]; then
  exit 0
fi

# --- Match: wrap in run_silent + inject fail-fast ---
WRAPPED=""

case "$COMMAND" in
  # vitest with fail-fast (bare `vitest` excluded — it launches watch mode)
  vitest\ run*)
    if [[ "$COMMAND" != *"--bail"* ]]; then
      WRAPPED="$RUN_SILENT $COMMAND --bail 1"
    else
      WRAPPED="$RUN_SILENT $COMMAND"
    fi ;;

  # pytest with fail-fast
  pytest\ *|pytest|uv\ run\ pytest\ *|uv\ run\ pytest)
    if [[ "$COMMAND" != *"-x"* ]]; then
      WRAPPED="$RUN_SILENT $COMMAND -x"
    else
      WRAPPED="$RUN_SILENT $COMMAND"
    fi ;;

  # pnpm scripts
  pnpm\ test*|pnpm\ run\ test*)           WRAPPED="$RUN_SILENT $COMMAND" ;;
  pnpm\ typecheck*|pnpm\ run\ typecheck*) WRAPPED="$RUN_SILENT $COMMAND" ;;
  pnpm\ lint*|pnpm\ run\ lint*)           WRAPPED="$RUN_SILENT $COMMAND" ;;
  pnpm\ build*|pnpm\ run\ build*)         WRAPPED="$RUN_SILENT $COMMAND" ;;
  pnpm\ verify*|pnpm\ run\ verify*)       WRAPPED="$RUN_SILENT $COMMAND" ;;
  pnpm\ check*|pnpm\ run\ check*)         WRAPPED="$RUN_SILENT $COMMAND" ;;
  pnpm\ format*|pnpm\ run\ format*)       WRAPPED="$RUN_SILENT $COMMAND" ;;

  # Direct tool invocations
  turbo\ run\ *)    WRAPPED="$RUN_SILENT $COMMAND" ;;
  tsc\ *)           WRAPPED="$RUN_SILENT $COMMAND" ;;
  biome\ check*)    WRAPPED="$RUN_SILENT $COMMAND" ;;
  ruff\ check*)     WRAPPED="$RUN_SILENT $COMMAND" ;;
  ruff\ format*)    WRAPPED="$RUN_SILENT $COMMAND" ;;
esac

# No match — pass through silently
if [ -z "$WRAPPED" ]; then
  exit 0
fi

# Emit rewrite JSON: wrap command + auto-approve
jq -n \
  --arg cmd "$WRAPPED" \
  --argjson timeout "$TIMEOUT" \
  --arg desc "$DESC" \
  '{
    "hookSpecificOutput": {
      "hookEventName": "PreToolUse",
      "permissionDecision": "allow",
      "permissionDecisionReason": "Context backpressure: wrapping in run_silent",
      "updatedInput": {
        "command": $cmd,
        "timeout": $timeout,
        "description": $desc
      }
    }
  }'
