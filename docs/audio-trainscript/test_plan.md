# Audio Trainscript Service — Test Plan

## Manual Test Scenarios (Active Scope)

### 1. Bilibili Audio Fallback Transcription (Golden Path)
- **Setup**: Select a Bilibili video known to have no subtitles.
- **Execution**: 
  - Send `POST http://<tailscale-host>:3000/api/transcribe` with `{ "type": "bilibili", "url": "video_url_here" }`.
- **Expected Results**:
  - SSE connection opens with `Content-Type: text/event-stream`.
  - Receives progress stream (`downloading` → `uploading` → `transcribing`).
  - `downloading` events carry `{"progress": N}` where N is an integer 0–100.
  - Finishes with a `done` event containing a valid timestamped JSON transcript.
  - Local `temp/` folder is empty and the uploaded file is removed from Gemini cloud files.

### 2. Error Cases
- **Invalid URL**: POST with a malformed URL → receives `error` SSE event, stream closes cleanly.
- **Members-only / age-restricted video**: POST with a restricted BVID → receives `error` SSE event (Bilibili 403); no temp files left behind.
- **Gemini quota exceeded**: With a mocked 429 from Gemini → receives `error` SSE event; local temp file is deleted despite the Gemini failure.
- **Download network timeout**: Simulate slow/no network during download → service respects a 5-minute download timeout and emits `error`.
- **Audio exceeds limit**: POST with a video longer than 3 hours or audio file > 200MB → `error` event emitted immediately after size check; no Gemini upload attempted.

### 3. Health Check
- `GET /health` returns `200 OK` with `{"status":"ok"}`.

---

## Automated Test Scenarios

- **Bilibili URL Parser** (`src/services/bilibili.test.ts`): Verify extraction of BVID and page parameters from standard, short-link, and episode URLs.
- **Gemini Response Parser** (`src/services/gemini.test.ts`): Validate that Gemini output is cleanly parsed into `[ { from: number, to: number, content: string } ]`; test malformed/partial JSON responses.
- **SSE Formatting** (`src/index.test.ts`): Verify that each emitted SSE chunk follows the `event: <name>\ndata: <json>\n\n` format and that the stream terminates after `done` or `error`.
- **Gemini Cleanup on Error** (`src/services/gemini.test.ts`): Confirm that `deleteFile()` is called even when transcription throws, and that local temp file is removed.
- **Concurrency / Rate Limit**: Note — with 15 RPM free-tier cap, simultaneous requests can exhaust quota. Manual smoke test: fire 2 concurrent requests and verify both complete or fail gracefully (no silent drops). Automated queue strategy deferred pending observed load.

---

## Future Todo Test Backlog

- **Google Drive Authentication & Downloader**: Test service account integration.
- **Multipart Upload Limit Validation**: Verify that uploads > 100MB are rejected, and uploads < 100MB are correctly streamed.
- **SQLite Database TTL Job**: Mock a record created 3 years ago and trigger the cleanup cron to verify deletion.
