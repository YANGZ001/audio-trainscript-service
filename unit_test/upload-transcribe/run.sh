#!/usr/bin/env bash
set -euo pipefail

HOST="${TRANSCRIBE_HOST:-http://localhost:3001}"
MODEL="${MODEL:-}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
FILE="${1:-$SCRIPT_DIR/input/sample.m4a}"

ENDPOINT="$HOST/api/upload-transcribe"
[[ -n "$MODEL" ]] && ENDPOINT="${ENDPOINT}?model=${MODEL}"

echo "=== upload-transcribe: done-shape test ==="
echo "Host : $HOST"
echo "File : $FILE"
[[ -n "$MODEL" ]] && echo "Model: $MODEL"
echo ""

if [[ ! -f "$FILE" ]]; then
  echo "SKIP — no input file found"
  echo "  Add a .m4a file at: unit_test/upload-transcribe/input/sample.m4a"
  exit 0
fi

RESULT=$(curl -s --no-buffer -N \
  -F "file=@$FILE;type=audio/mp4" \
  "$ENDPOINT")

echo "$RESULT" | awk '
/^event: / { printf "[%s]\n", substr($0,8) }
' 2>/dev/null || true

if ! echo "$RESULT" | grep -q "^event: done"; then
  echo "FAIL — no done event received"
  echo "$RESULT" | grep "^event:" || true
  exit 1
fi

DONE_DATA=$(echo "$RESULT" | awk '/^event: done/{f=1} f && /^data: /{print substr($0,7); exit}')

python3 - "$DONE_DATA" <<'EOF'
import sys, json
try:
    d = json.loads(sys.argv[1])
except Exception as e:
    print(f"FAIL — done data is not valid JSON: {e}")
    sys.exit(1)
if not isinstance(d.get("text"), str) or len(d["text"]) == 0:
    print(f"FAIL — done.text is missing or empty: {d}")
    sys.exit(1)
print(f"PASS — done.text is {len(d['text'])} chars")
EOF
