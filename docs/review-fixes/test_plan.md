# Review Fixes — Test Plan

## Manual Tests

### 1. 200 MB size-limit breach (Fix #1)
- **Setup**: point `BILIBILI_SESSION_TOKEN` at a valid session; find a video whose audio stream exceeds 200 MB (or temporarily lower `MAX_FILE_SIZE` to 1 MB for testing).
- **Action**: `POST /api/transcribe` with that URL.
- **Expected**: SSE stream emits `event: error` with `{"error":"Audio file exceeds the 200MB size limit"}` and closes. The connection does **not** hang.

### 2. Missing SESSDATA (Fix #4)
- **Setup**: start the service with `BILIBILI_SESSION_TOKEN` unset (remove from `.env`).
- **Action**: `POST /api/transcribe` with any Bilibili URL.
- **Expected**: SSE stream emits `event: error` with `{"error":"BILIBILI_SESSION_TOKEN is not set"}`.

### 3. Gemini processing timeout (Fix #2)
- **Setup**: mock or stub `ai.files.get` to always return `state: 'PROCESSING'` (or simulate via a very slow upload).
- **Expected**: after ~5 minutes, stream emits `event: error` with `{"error":"Gemini file processing timed out"}`.

### 4. Orphan cleanup with missing createTime (Fix #3)
- **Setup**: mock `ai.files.list` to return a file entry with no `createTime`.
- **Expected**: `cleanupOrphanedGeminiFiles` does not attempt to delete that file; no error thrown.

### 5. Concurrent requests (Fix #5)
- **Setup**: fire two simultaneous `POST /api/transcribe` requests.
- **Expected**: two distinct temp file paths in `/tmp`; no file-name collision; both requests complete independently.

### 6. Non-root container user (Fix #9)
- **Action**: `docker compose up --build -d` then `docker exec audio-trainscript-service whoami`.
- **Expected**: output is `app`.

### 7. test.sh with special characters in URL (Fix #11)
- **Action**: `./test.sh 'https://www.bilibili.com/video/BV1heV86BEZv/?p=1&t=10'`
- **Expected**: curl sends a valid JSON body; no malformed JSON error from the server.

## Regression Checks

- `GET /health` still returns `{"status":"ok"}` after all changes.
- A normal end-to-end transcription (valid URL, valid credentials) still produces a `done` SSE event with a JSON array of segments.
- `docker compose up --build` succeeds without compile errors.
