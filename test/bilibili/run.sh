#!/usr/bin/env bash
set -euo pipefail

HOST="${TRANSCRIBE_HOST:-http://localhost:3001}"
MODEL="${MODEL:-}"
URL="${1:-https://www.bilibili.com/video/BV1te5R6zE5f/}"

ENDPOINT="$HOST/api/transcribe"
[[ -n "$MODEL" ]] && ENDPOINT="${ENDPOINT}?model=${MODEL}"

echo "=== bilibili: done-shape test ==="
echo "Host : $HOST"
echo "URL  : $URL"
[[ -n "$MODEL" ]] && echo "Model: $MODEL"
echo ""

RESULT=$(curl -s --no-buffer -N \
  -H "Content-Type: application/json" \
  -d "{\"type\":\"bilibili\",\"url\":\"$URL\"}" \
  "$ENDPOINT")

# Show progress
echo "$RESULT" | awk '
/^event: downloading/ { next }
/^data: / && prev == "downloading" { next }
{ prev = "" }
/^event: / { prev = substr($0,8); printf "[%s]\n", prev }
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
