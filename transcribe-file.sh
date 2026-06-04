#!/usr/bin/env bash
set -euo pipefail

HOST="${TRANSCRIBE_HOST:-http://zyfun-ubuntu26:3001}"
MODEL="${MODEL:-}"
FILE="${1:-}"
OUTPUT="${2:-}"

if [[ -z "$FILE" ]]; then
  echo "Usage: ./transcribe-file.sh <path-to-audio.m4a> [output.md]"
  echo "   eg: ./transcribe-file.sh interview.m4a transcript.md"
  exit 1
fi

ENDPOINT="$HOST/api/upload-transcribe"
[[ -n "$MODEL" ]] && ENDPOINT="${ENDPOINT}?model=${MODEL}"

echo "Host   : $HOST"
echo "File   : $FILE"
[[ -n "$OUTPUT" ]] && echo "Output : $OUTPUT"
echo "Model  : ${MODEL:-gemini-3.1-flash-lite}"
echo ""

curl -s --no-buffer -N \
  -F "file=@${FILE};type=audio/mp4" \
  "$ENDPOINT" \
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
    print "ERROR: " msg > "/dev/stderr"
    exit 1
  }
}
'
