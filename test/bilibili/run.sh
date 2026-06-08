#!/usr/bin/env bash
set -euo pipefail

HOST="${TRANSCRIBE_HOST:-http://localhost:3001}"
MODEL="${MODEL:-}"
URL="${1:-https://www.bilibili.com/video/BV1te5R6zE5f/}"

ENDPOINT="$HOST/api/transcribe"
[[ -n "$MODEL" ]] && ENDPOINT="${ENDPOINT}?model=${MODEL}"

echo "Host : $HOST"
echo "URL  : $URL"
[[ -n "$MODEL" ]] && echo "Model: $MODEL"
echo ""

TMPFILE=$(mktemp)
trap 'rm -f "$TMPFILE"' EXIT

curl -s --no-buffer -N \
  -H "Content-Type: application/json" \
  -d "{\"url\":\"$URL\"}" \
  "$ENDPOINT" \
| tee "$TMPFILE" \
| awk '
/^event: / { evt = substr($0, 8) }
/^$/        { evt = "" }
/^data: / && evt != "" {
  data = substr($0, 7)
  if (evt == "downloading") {
    if (match(data, /"progress":[0-9]+/)) p = substr(data, RSTART+11, RLENGTH-11) + 0
    filled = int(p/5); empty = 20 - filled
    bar = ""
    for (j = 1; j <= filled; j++) bar = bar "#"
    for (j = 1; j <= empty;  j++) bar = bar "-"
    printf "\r[downloading] [%s] %3d%%", bar, p; fflush()
    if (p == 100) { print ""; fflush() }
  } else if (evt == "uploading") {
    print "\n[uploading to Gemini...]"; fflush()
  } else if (evt == "transcribing") {
    print "[transcribing...]"; fflush()
  } else if (evt == "done") {
    text = data
    sub(/^\{"text":"/, "", text)
    sub(/"[}]$/, "", text)
    print ""
    print "=== TRANSCRIPT ==="
    print text
    print ""; print "Done."
  } else if (evt == "error") {
    if (match(data, /"error":"[^"]*"/)) msg = substr(data, RSTART+9, RLENGTH-10)
    else msg = data
    print "ERROR: " msg > "/dev/stderr"; fflush("/dev/stderr")
  }
}
' || true

RESULT=$(cat "$TMPFILE")

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
