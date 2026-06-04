# Tests: Raw Transcript Passthrough

## Manual Test Scenarios

### Golden path — Bilibili URL

```bash
curl -N -X POST http://localhost:3001/api/transcribe \
  -H 'Content-Type: application/json' \
  -d '{"type":"bilibili","url":"<valid bilibili url>"}'
```

Expected SSE sequence:
1. `event: downloading` with `{ progress: <0-100> }` (one or more)
2. `event: uploading` with `{}`
3. `event: transcribing` with `{}`
4. `event: done` with `{ "text": "<non-empty string>" }`

The `text` value should contain Gemini's raw output (typically JSON-shaped with timestamps).

### Golden path — file upload

```bash
curl -N -X POST http://localhost:3001/api/upload-transcribe \
  -F 'file=@sample.m4a'
```

Expected SSE sequence:
1. `event: uploading` with `{}`
2. `event: transcribing` with `{}`
3. `event: done` with `{ "text": "<non-empty string>" }`

### Regression — previously failing video

Use the video that triggered the `{"=420.734` failure:

```bash
URL="https://www.bilibili.com/video/BV16eSQYLEWa/?spm_id_from=333.1387.search.video_card.click&vd_source=ddfc282b601b93a66dee12bfd02eca49"

curl -N -X POST http://localhost:3001/api/transcribe \
  -H 'Content-Type: application/json' \
  -d "{\"type\":\"bilibili\",\"url\":\"$URL\"}" \
  -o output.txt
```

Expected: `done` event present, no `error` event, no `[ERROR]` in docker logs.

### Error path — invalid URL

```bash
curl -N -X POST http://localhost:3001/api/transcribe \
  -H 'Content-Type: application/json' \
  -d '{"type":"bilibili","url":"https://example.com/not-bilibili"}'
```

Expected: `event: error` with `{ "error": "Cannot extract BVID from URL: ..." }`.

### Error path — missing type

```bash
curl -X POST http://localhost:3001/api/transcribe \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://www.bilibili.com/video/BV16eSQYLEWa"}'
```

Expected: HTTP 400 JSON response (not SSE), no crash.

## Automated Tests

No automated tests exist yet. If added, place under `test/` and cover:

- `extractBvid` (already pure, easily unit-tested)
- Mock Gemini returning malformed JSON strings — assert `done.text` equals the raw string unchanged

### Regression — web UI produces non-empty transcript

Open `http://localhost:3001` in a browser, paste a valid Bilibili URL, click Transcribe. After the `done` event, the transcript textarea must contain text — not be blank. (The blank-textarea failure mode is the silent bug that occurs if `handleEvent` still tries to join a `Segment[]` after the payload changes to `{ text: string }`.)

## Regression Checks

- `/health` endpoint still returns `{ "status": "ok" }` after rebuild
- Docker compose build completes without TypeScript errors (`tsc --noEmit`)
- No `[ERROR]` log lines for a successful transcription request
