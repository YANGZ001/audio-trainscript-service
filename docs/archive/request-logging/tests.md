# Tests: Comprehensive Request Logging

## Manual Test Scenarios

### Golden path — Bilibili URL

1. Start the service: `docker compose up --build`
2. Send a request:
   ```bash
   curl -N -X POST http://localhost:3000/api/transcribe \
     -H 'Content-Type: application/json' \
     -d '{"type":"bilibili","url":"https://www.bilibili.com/video/BV16eSQYLEWa/"}'
   ```
3. In another terminal, watch logs: `docker compose logs -f`
4. Expected log sequence (all prefixed `[BV16eSQYLEWa]`):
   - `transcribe request received`
   - `bvid extracted`
   - `fetching cid`
   - `cid=<number>`
   - `fetching audio stream url`
   - `audio stream url obtained`
   - `downloading audio`
   - `download complete (<X> MB, <Xs>)`
   - `uploading to Gemini`
   - `Gemini file uploaded, state=<state>`
   - `waiting for Gemini processing (attempt 1)` (may repeat)
   - `file ready, generating transcript (model=<model>)`
   - `transcript received (<N> chars)`
   - `transcription done (<N> segments, <Xs> total)`
   - `Gemini file deleted`

### Error path — invalid URL

1. Send a request with an invalid Bilibili URL:
   ```bash
   curl -N -X POST http://localhost:3000/api/transcribe \
     -H 'Content-Type: application/json' \
     -d '{"type":"bilibili","url":"https://www.bilibili.com/not-a-video"}'
   ```
2. Expected: SSE error event returned to client.
3. Expected in logs: `[bilibili] error —` (fallback tag since BVID extraction fails before BVID is known).

### Upload-transcribe path

1. Send a local `.m4a` file:
   ```bash
   curl -N -X POST http://localhost:3000/api/upload-transcribe \
     -F 'file=@/path/to/sample.m4a'
   ```
2. Expected log prefix: `[sample.m4a]` for all log lines in the transcription phase.

## Regression Checks

- `/health` endpoint still returns `{"status":"ok"}` — no change expected.
- SSE event format (`downloading`, `uploading`, `transcribing`, `done`, `error`) unchanged — only server-side console logs added.
- Existing error logs (`[transcribe]`, `[upload-transcribe]`, Gemini cleanup) still appear on error paths.

## Automated Tests

No automated test suite exists in this repo (`test/` directory is empty). Manual verification against the golden path above is the acceptance check. If a test suite is added later, the key assertions would be:

- `downloadBilibiliAudio` calls: verify `tag` appears in mocked `console.log` output.
- `transcribeAudio` calls: verify polling log appears N times for N poll iterations.
