#!/usr/bin/env bash
set -euo pipefail

HOST="${TRANSCRIBE_HOST:-http://localhost:3001}"
MODEL="${MODEL:-}"
URL="${1:-}"

if [[ -z "$URL" ]]; then
  echo "Usage: ./test.sh <bilibili-url>"
  echo "   eg: ./test.sh 'https://www.bilibili.com/video/BV1heV86BEZv/'"
  exit 1
fi

ENDPOINT="$HOST/api/transcribe"
[[ -n "$MODEL" ]] && ENDPOINT="${ENDPOINT}?model=${MODEL}"

echo "Host : $HOST"
echo "Video: $URL"
[[ -n "$MODEL" ]] && echo "Model: $MODEL"
echo ""

curl -s --no-buffer -N \
  -H "Content-Type: application/json" \
  -d "$(jq -n --arg url "$URL" '{type:"bilibili",url:$url}')" \
  "$ENDPOINT" \
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
    print "ERROR: " msg > "/dev/stderr"
    exit 1
  }
}
'
