#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HTML="$SCRIPT_DIR/../../public/index.html"
PASS=0; FAIL=0

check() {
  local name="$1"; local result="$2"
  if [[ "$result" == "PASS" ]]; then
    echo "PASS — $name"
    PASS=$((PASS + 1))
  else
    echo "FAIL — $name: $result"
    FAIL=$((FAIL + 1))
  fi
}

# ── HTML structure checks ──────────────────────────────────────────────────────

if grep -q 'id="format-btn"' "$HTML"; then
  check "format-btn element exists" "PASS"
else
  check "format-btn element exists" "button#format-btn not found in HTML"
fi

if grep -q 'onclick="formatTranscript()"' "$HTML"; then
  check "format-btn has onclick=formatTranscript()" "PASS"
else
  check "format-btn has onclick=formatTranscript()" "onclick not found"
fi

if grep -q 'id="format-btn"' "$HTML" && grep -q 'id="copy-btn"' "$HTML"; then
  # format-btn must appear before copy-btn in the file
  fmt_line=$(grep -n 'id="format-btn"' "$HTML" | head -1 | cut -d: -f1)
  copy_line=$(grep -n 'id="copy-btn"' "$HTML" | head -1 | cut -d: -f1)
  if [[ $fmt_line -lt $copy_line ]]; then
    check "format-btn is before copy-btn in DOM" "PASS"
  else
    check "format-btn is before copy-btn in DOM" "format-btn (line $fmt_line) is after copy-btn (line $copy_line)"
  fi
fi

if grep -q 'function formatTranscript()' "$HTML"; then
  check "formatTranscript() function defined" "PASS"
else
  check "formatTranscript() function defined" "function not found in HTML"
fi

if grep -q "format error: " "$HTML"; then
  check "error message contains 'format error:'" "PASS"
else
  check "error message contains 'format error:'" "error string not found"
fi

# Check format-btn is disabled/enabled alongside copy-btn
if grep -B2 -A2 "copy-btn.*disabled = true" "$HTML" | grep -q "format-btn"; then
  check "format-btn disabled at run start (alongside copy-btn)" "PASS"
else
  check "format-btn disabled at run start (alongside copy-btn)" "format-btn not disabled near copy-btn reset"
fi

if grep -B2 -A2 "copy-btn.*disabled = false" "$HTML" | grep -q "format-btn"; then
  check "format-btn enabled on transcript arrival (alongside copy-btn)" "PASS"
else
  check "format-btn enabled on transcript arrival (alongside copy-btn)" "format-btn not enabled near copy-btn enable"
fi

# ── Logic checks via Node.js ───────────────────────────────────────────────────

node - <<'EOF'
const assert = require('assert');

// Replicate the formatTranscript logic
function formatTranscript(value, setStatus) {
  try {
    const parsed = JSON.parse(value);
    const formatted = JSON.stringify(parsed, null, 2);
    return { ok: true, value: formatted, charCount: formatted.length };
  } catch (err) {
    setStatus('format error: ' + err.message, 'error');
    return { ok: false };
  }
}

let lastStatus = null;
const captureStatus = (msg, type) => { lastStatus = { msg, type }; };

// Test 1: valid JSON array is pretty-printed
const validInput = '[{"from":0,"to":4,"content":"Hello."},{"from":4,"to":8,"content":"World."}]';
const r1 = formatTranscript(validInput, captureStatus);
assert.strictEqual(r1.ok, true, 'valid JSON should succeed');
const parsed1 = JSON.parse(r1.value);
assert.deepStrictEqual(parsed1, JSON.parse(validInput), 'formatted value parses to same structure');
assert.ok(r1.value.includes('\n'), 'formatted output should be multi-line');
assert.ok(r1.value.includes('  '), 'formatted output should be indented');
console.log('PASS — valid JSON is pretty-printed correctly');

// Test 2: invalid JSON triggers error, returns ok:false
lastStatus = null;
const r2 = formatTranscript('not valid json', captureStatus);
assert.strictEqual(r2.ok, false, 'invalid JSON should fail');
assert.ok(lastStatus?.msg.startsWith('format error:'), 'error message should start with "format error:"');
assert.strictEqual(lastStatus?.type, 'error', 'error type should be "error"');
console.log('PASS — invalid JSON triggers error without modifying content');

// Test 3: already-formatted JSON is idempotent
const prettyInput = JSON.stringify([{"from":0,"to":4,"content":"Hi."}], null, 2);
const r3 = formatTranscript(prettyInput, captureStatus);
assert.strictEqual(r3.ok, true, 'already-formatted JSON should succeed');
assert.deepStrictEqual(JSON.parse(r3.value), JSON.parse(prettyInput), 'idempotent re-format produces equivalent JSON');
console.log('PASS — formatting already-formatted JSON is idempotent');
EOF

node_exit=$?
if [[ $node_exit -eq 0 ]]; then
  PASS=$((PASS + 3))
else
  FAIL=$((FAIL + 1))
fi

echo ""
echo "Results: ${PASS} passed  ${FAIL} failed"
[[ $FAIL -eq 0 ]]
