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
    gsub(/^\[|\]$/, "", data)
    n = split(data, objs, /},{/)
    print ""
    print "=== TRANSCRIPT (" n " segments) ==="
    if (out != "") { print "# Transcript: " src > out; print "" > out }
    for (i = 1; i <= n; i++) {
      obj = objs[i]
      from = 0; to = 0; content = ""
      if (match(obj, /"from":[0-9.]+/))    from    = substr(obj, RSTART+7,  RLENGTH-7)  + 0
      if (match(obj, /"to":[0-9.]+/))      to      = substr(obj, RSTART+5,  RLENGTH-5)  + 0
      if (match(obj, /"content":"[^"]*"/)) content = substr(obj, RSTART+11, RLENGTH-12)
      mf = int(from/60); mt = int(to/60)
      line = sprintf("  %d:%05.2f -> %d:%05.2f   %s", mf, from-mf*60, mt, to-mt*60, content)
      print line
      if (out != "") print line > out
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
