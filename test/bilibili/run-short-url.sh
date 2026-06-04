#!/usr/bin/env bash
# Test that b23.tv short URLs are resolved and transcribed correctly.
set -euo pipefail

HOST="${TRANSCRIBE_HOST:-http://localhost:3001}"
SHORT_URL="https://b23.tv/rDoCYxq"

echo "=== b23.tv short URL test ==="
echo "Short URL: $SHORT_URL"
echo ""

exec "$(dirname "$0")/run.sh" "$SHORT_URL"
