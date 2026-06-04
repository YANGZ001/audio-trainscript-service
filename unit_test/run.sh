#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PASS=0; FAIL=0; SKIP=0

run_test() {
  local name="$1"; local script="$2"; shift 2
  echo "━━━ $name ━━━"
  local exit_code=0
  bash "$script" "$@" || exit_code=$?
  if [[ $exit_code -eq 0 ]]; then
    PASS=$((PASS + 1))
  else
    FAIL=$((FAIL + 1))
  fi
  echo ""
}

# Intercept SKIP exit (upload test exits 0 with "SKIP" message when no file)
run_test "bilibili"          "$SCRIPT_DIR/bilibili/run.sh"
run_test "upload-transcribe" "$SCRIPT_DIR/upload-transcribe/run.sh"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Results: ${PASS} passed  ${FAIL} failed"
[[ $FAIL -eq 0 ]]
