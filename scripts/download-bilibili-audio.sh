#!/usr/bin/env bash
# Download the highest-quality audio stream from a Bilibili video as .m4a
# Requires BILIBILI_SESSION_TOKEN in .env (SESSDATA cookie)
#
# Usage:
#   ./scripts/download-bilibili-audio.sh <bilibili-url> <output-path>
#
# Example:
#   ./scripts/download-bilibili-audio.sh \
#     'https://www.bilibili.com/video/BV1te5R6zE5f/' \
#     test/upload-transcribe/input/sample.m4a
set -euo pipefail

URL="${1:-}"
OUTPUT="${2:-}"

if [[ -z "$URL" || -z "$OUTPUT" ]]; then
  echo "Usage: $0 <bilibili-url> <output-path>"
  echo "  eg:  $0 'https://www.bilibili.com/video/BV1te5R6zE5f/' audio.m4a"
  exit 1
fi

# Load SESSDATA from .env in repo root
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../.env"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Error: .env not found at $ENV_FILE"
  exit 1
fi
SESSDATA=$(grep '^BILIBILI_SESSION_TOKEN=' "$ENV_FILE" | cut -d= -f2-)
if [[ -z "$SESSDATA" ]]; then
  echo "Error: BILIBILI_SESSION_TOKEN not set in .env"
  exit 1
fi

UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

BVID=$(python3 -c "
import re, sys
m = re.search(r'/video/(BV[a-zA-Z0-9]+)', sys.argv[1])
if not m: sys.exit('Cannot extract BVID from URL: ' + sys.argv[1])
print(m.group(1))
" "$URL")
echo "BVID : $BVID"

CID=$(curl -s "https://api.bilibili.com/x/web-interface/view?bvid=$BVID" \
  -H "User-Agent: $UA" \
  -H "Referer: https://www.bilibili.com" \
  -H "Cookie: SESSDATA=$SESSDATA" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['cid'])")
echo "CID  : $CID"

AUDIO_URL=$(curl -s "https://api.bilibili.com/x/player/playurl?bvid=$BVID&cid=$CID&fnval=16&fnver=0&fourk=1" \
  -H "User-Agent: $UA" \
  -H "Referer: https://www.bilibili.com" \
  -H "Cookie: SESSDATA=$SESSDATA" \
  | python3 -c "
import sys, json
d = json.load(sys.stdin)
if d['code'] != 0: sys.exit('playurl error: ' + d['message'])
streams = d['data']['dash']['audio']
best = sorted(streams, key=lambda s: s['bandwidth'], reverse=True)[0]
print(best.get('baseUrl') or best.get('base_url'))
")

echo "Downloading audio to $OUTPUT ..."
curl -L --progress-bar \
  -H "User-Agent: $UA" \
  -H "Referer: https://www.bilibili.com" \
  -H "Cookie: SESSDATA=$SESSDATA" \
  "$AUDIO_URL" \
  -o "$OUTPUT"

echo "Done: $(du -h "$OUTPUT" | cut -f1)  $OUTPUT"
