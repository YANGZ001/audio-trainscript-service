#!/usr/bin/env bash
set -euo pipefail

HOST="${TRANSCRIBE_HOST:-http://zyfun-ubuntu26:3001}"
FILE="${1:-}"
OUTPUT="${2:-}"

if [[ -z "$FILE" ]]; then
  echo "Usage: ./test-upload.sh <path-to-audio.m4a> [output.md]"
  echo "   eg: ./test-upload.sh interview.m4a transcript.md"
  exit 1
fi

echo "Host   : $HOST"
echo "File   : $FILE"
[[ -n "$OUTPUT" ]] && echo "Output : $OUTPUT"
echo ""

curl -s --no-buffer -N \
  -F "file=@${FILE};type=audio/mp4" \
  "$HOST/api/upload-transcribe" \
| python3 -c "
import sys, json, os

output_path = sys.argv[1] if len(sys.argv) > 1 else ''
source_name = os.path.basename('${FILE}')

evt = ''
for line in sys.stdin:
    line = line.rstrip()
    if line.startswith('event:'):
        evt = line.split(' ', 1)[1]
        if evt == 'uploading':
            print('[uploading to Gemini...]', flush=True)
        elif evt == 'transcribing':
            print('[transcribing...]', flush=True)
        elif evt == 'error':
            pass
    elif line.startswith('data:') and evt:
        payload = line.split(' ', 1)[1]
        if evt == 'done':
            segs = json.loads(payload)
            print()
            print(f'=== TRANSCRIPT ({len(segs)} segments) ===')
            lines = []
            for s in segs:
                from_s = s.get('from', 0)
                to_s   = s.get('to', 0)
                text   = s.get('content') or s.get('text') or repr(s)
                mins_f, secs_f = int(from_s) // 60, from_s % 60
                mins_t, secs_t = int(to_s)   // 60, to_s   % 60
                ts = f'{mins_f}:{secs_f:05.2f} -> {mins_t}:{secs_t:05.2f}'
                print(f'  {ts}   {text}')
                lines.append((ts, text))
            print()
            print('Done.')
            if output_path:
                with open(output_path, 'w') as f:
                    f.write(f'# Transcript: {source_name}\n\n')
                    for ts, text in lines:
                        f.write(f'  {ts}   {text}\n')
                print(f'Saved to {output_path}')
        elif evt == 'error':
            msg = json.loads(payload).get('error', payload)
            print(f'\nERROR: {msg}', file=sys.stderr)
            sys.exit(1)
" "$OUTPUT"
