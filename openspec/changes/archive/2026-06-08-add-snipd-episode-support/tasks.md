## 1. Snipd Service Module

- [x] 1.1 Create `src/services/snipd.ts` with `extractSnipdEpisodeId(url)` — regex `/episode\/([0-9a-f-]{36})/i`, throw descriptive error on mismatch
- [x] 1.2 Implement `fetchSnipdEpisodePage(url)` — GET with browser-like headers (`User-Agent`, `Accept`, `Accept-Language`), throw `SnipdPageBlockedError` on non-200 response
- [x] 1.3 Implement `parseSnipdEpisodeData(html)` — regex-extract `__NEXT_DATA__` script content, parse JSON, navigate to audio URL and episode metadata fields, throw descriptive error if audio URL is missing
- [x] 1.4 Map Snipd JSON fields to `TranscriptMeta`: `podcastTitle` → `ownerName`, `title`, `description` → `desc`, `durationInSeconds` → `duration`, `podcastGenre` → `tname`
- [x] 1.5 Implement `downloadSnipdAudio(audioUrl, destPath, onProgress)` — stream MP3 to disk with progress callback, enforce 500 MB cap, 30s connect timeout

## 2. Router Integration

- [x] 2.1 In `src/index.ts`, replace `type`-based validation with a `detectSource(url)` helper that matches URL patterns (`bilibili.com`/`b23.tv` → `"bilibili"`, `share.snipd.com/episode/` → `"snipd"`) and throws HTTP 400 for unrecognised URLs
- [x] 2.2 Update the `/api/transcribe` handler to branch on the detected source; remove the `type` field from the request body validation
- [x] 2.3 Add `snipd` branch: extract episode UUID via `extractSnipdEpisodeId`, check cache at `/data/snipd-audio/<uuid>.mp3`, call `fetchSnipdEpisodePage` → `parseSnipdEpisodeData` → `downloadSnipdAudio` on miss, then call `transcribeAudio` with metadata
- [x] 2.4 Update `public/index.html` — remove the source type selector from the UI (the URL field alone is now sufficient)

## 3. Infrastructure

- [x] 3.1 In `Dockerfile`, add `RUN mkdir -p /data/snipd-audio && chown app:app /data/snipd-audio` alongside the existing bilibili-audio directory creation
- [x] 3.2 In `docker-compose.yml`, add named volume `snipd-audio-cache` mapped to `/data/snipd-audio` in the service volumes section

## 4. Tests & Verification

- [x] 4.1 Create `test/snipd/run.sh` — POST to `/api/transcribe` with `{ "url": "<snipd-url>" }`, parse SSE stream, assert `done` event with non-empty `text`
- [x] 4.2 Run `docker compose up --build` to confirm image builds cleanly
- [x] 4.3 Run `test/snipd/run.sh` against `https://share.snipd.com/episode/1b4b43d0-e87a-49bc-90e9-f1b721e6488a` and verify transcript output
- [x] 4.4 Run a second identical request and confirm cache hit (no `downloading` events in SSE stream)
