#!/usr/bin/env bash
set -euo pipefail

HOST="${TRANSCRIBE_HOST:-http://localhost:3001}"
URL="${1:-}"

if [[ -z "$URL" ]]; then
  echo "Usage: ./test.sh <bilibili-url>"
  echo "   eg: ./test.sh 'https://www.bilibili.com/video/BV1heV86BEZv/'"
  exit 1
fi

echo "Host : $HOST"
echo "Video: $URL"
echo ""

curl -s --no-buffer -N \
  -H "Content-Type: application/json" \
  -d "$(jq -n --arg url "$URL" '{type:"bilibili",url:$url}')" \
  "$HOST/api/transcribe" \
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
    gsub(/^\[|\]$/, "", data)
    n = split(data, objs, /},{/)
    print ""
    print "=== TRANSCRIPT (" n " segments) ==="
    for (i = 1; i <= n; i++) {
      obj = objs[i]
      from = 0; to = 0; content = ""
      if (match(obj, /"from":[0-9.]+/))    from    = substr(obj, RSTART+7,  RLENGTH-7)  + 0
      if (match(obj, /"to":[0-9.]+/))      to      = substr(obj, RSTART+5,  RLENGTH-5)  + 0
      if (match(obj, /"content":"[^"]*"/)) content = substr(obj, RSTART+11, RLENGTH-12)
      mf = int(from/60); mt = int(to/60)
      printf "  %d:%05.2f -> %d:%05.2f   %s\n", mf, from-mf*60, mt, to-mt*60, content
    }
    print ""; print "Done."
  } else if (evt == "error") {
    if (match(data, /"error":"[^"]*"/)) msg = substr(data, RSTART+9, RLENGTH-10)
    else msg = data
    print "ERROR: " msg > "/dev/stderr"
    exit 1
  }
}
'
