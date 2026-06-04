#!/usr/bin/env bash
set -euo pipefail

HOST="${TRANSCRIBE_HOST:-http://localhost:3001}"
MODEL="${MODEL:-}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
FILE="${1:-$SCRIPT_DIR/input/sample.m4a}"
OUTPUT="${2:-}"

ENDPOINT="$HOST/api/upload-transcribe"
[[ -n "$MODEL" ]] && ENDPOINT="${ENDPOINT}?model=${MODEL}"

echo "Host   : $HOST"
echo "File   : $FILE"
[[ -n "$OUTPUT" ]] && echo "Output : $OUTPUT"
echo "Model  : ${MODEL:-gemini-3.1-flash-lite}"
echo ""

if [[ ! -f "$FILE" ]]; then
  echo "SKIP — no input file found"
  echo "  Add a .m4a file at: test/upload-transcribe/input/sample.m4a"
  exit 0
fi

TMPFILE=$(mktemp)
trap 'rm -f "$TMPFILE"' EXIT

curl -s --no-buffer -N \
  -F "file=@${FILE};type=audio/mp4" \
  "$ENDPOINT" \
| tee "$TMPFILE" \
| awk -v out="$OUTPUT" -v src="$(basename "$FILE")" '
/^event: / { evt = substr($0, 8) }
/^$/        { evt = "" }
/^data: / && evt != "" {
  data = substr($0, 7)
  if (evt == "uploading") {
    print "[uploading to Gemini...]"; fflush()
  } else if (evt == "transcribing") {
    print "[transcribing...]"; fflush()
  } else if (evt == "done") {
    text = data
    sub(/^\{"text":"/, "", text)
    sub(/"[}]$/, "", text)
    print ""
    print "=== TRANSCRIPT ==="
    print text
    if (out != "") {
      print "# Transcript: " src > out
      print text > out
    }
    print ""; print "Done."
    if (out != "") print "\nSaved to " out
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
