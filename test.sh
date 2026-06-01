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
| python3 -c "
import sys, json

evt = ''
for line in sys.stdin:
    line = line.rstrip()
    if line.startswith('event:'):
        evt = line.split(' ', 1)[1]
        if evt == 'uploading':
            print('\n[uploading to Gemini...]', flush=True)
        elif evt == 'transcribing':
            print('[transcribing...]', flush=True)
        elif evt == 'error':
            pass  # printed below with data
    elif line.startswith('data:') and evt:
        payload = line.split(' ', 1)[1]
        if evt == 'downloading':
            p = json.loads(payload)['progress']
            bar = '#' * (p // 5) + '-' * (20 - p // 5)
            print(f'\r[downloading] [{bar}] {p:3d}%', end='', flush=True)
            if p == 100:
                print()
        elif evt == 'done':
            segs = json.loads(payload)
            print()
            print(f'=== TRANSCRIPT ({len(segs)} segments) ===')
            for s in segs:
                from_s = s.get('from', 0)
                to_s   = s.get('to', 0)
                text   = s.get('content') or s.get('text') or repr(s)
                mins_f, secs_f = int(from_s) // 60, from_s % 60
                mins_t, secs_t = int(to_s)   // 60, to_s   % 60
                ts = f'{mins_f}:{secs_f:05.2f} -> {mins_t}:{secs_t:05.2f}'
                print(f'  {ts}   {text}')
            print()
            print('Done.')
        elif evt == 'error':
            msg = json.loads(payload).get('error', payload)
            print(f'\nERROR: {msg}', file=sys.stderr)
            sys.exit(1)
"
