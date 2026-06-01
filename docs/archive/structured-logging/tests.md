# Tests: Structured Logging with pino

## Manual Test Scenarios

### Golden path — production-style JSON output

1. `docker compose up --build`
2. Send a Bilibili transcription request:
   ```
   curl -X POST http://localhost:3000/api/transcribe \
     -H 'Content-Type: application/json' \
     -d '{"type":"bilibili","url":"https://www.bilibili.com/video/BVxxx"}'
   ```
3. In docker compose logs, every line should be a valid JSON object.
4. Each line must contain a `time` field in ISO 8601 format (e.g. `"2026-06-01T12:00:00.000Z"`).
5. Lines related to this request must contain `"bvid":"BVxxx"` as a top-level field (not inside `msg`).

### LOG_LEVEL control

1. Set `LOG_LEVEL=debug` in `docker-compose.yml` (or `.env`).
2. Restart with `docker compose up --build`.
3. Debug lines (e.g. `"bvid extracted"`, `"fetching cid"`) must appear.
4. Unset `LOG_LEVEL` (or set to `info`).
5. Debug lines must not appear; info/warn/error lines still appear.

### Upload endpoint

1. Send a file via `/api/upload-transcribe`.
2. Log lines must contain `"fileTag":"<original-filename>"` as a top-level field.

### Startup error (missing API key)

1. Unset `GEMINI_API_KEY` and restart.
2. The startup cleanup error must appear as a pino `error`-level JSON line (not a plain string).

## Regression Checks

- `/health` endpoint still returns `{"status":"ok"}` after the logging change.
- No new console.log calls introduced (run `grep -r 'console\.' src/` — should return zero results after migration).

## Automated Tests

No automated test suite exists in this project. Manual verification against the scenarios above serves as the acceptance check.
