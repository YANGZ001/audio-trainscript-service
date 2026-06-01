# Audio Trainscript Service — Tasks

## Phase 1: Infrastructure & Downloader Setup ✅
- [x] Initialize Node.js TypeScript project.
- [x] Set up Dockerfile and `docker-compose.yml` configurations.
- [x] Implement Bilibili audio downloader resolving playurl audio stream via B站 player/playurl API.
- [x] Support utilizing the existing `BILIBILI_SESSION_TOKEN` cookie to resolve restricted/high-definition audio streams.

## Phase 2: Gemini Integration & Server-Sent Events (SSE) ✅
- [x] Integrate `@google/genai` SDK.
- [x] Implement file upload to Gemini File API and ensure garbage collection (deleting both local temp file and Google cloud file after request completion).
- [x] Implement startup scan that deletes any orphaned Gemini cloud files older than 1 hour (crash-recovery cleanup).
- [x] Write system prompt instructing `gemini-3.1-flash-lite` to return a structured JSON array of timestamps and content.
- [x] Implement Express server with `GET /health` and `POST /api/transcribe` (SSE), enforcing 200MB / 3-hour audio limits.
- [x] Set SSE response headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`.
- [x] Implement error-path SSE events for Bilibili 403/404, Gemini quota errors, and size/duration limit violations.
- [x] Repair Gemini response quirks: missing key quote, MM:SS timestamps past 60s, missing `"to"` key entirely.

## Phase 3: Copilot Web Integration ✅
- [x] Update `bilibili-copilot-web`'s `lib/bilibili.ts` to call the transcription service (via Tailscale MagicDNS hostname) when the subtitle lookup returns empty or fails with "字幕获取失败".
  - Apply a 10-minute SSE stream timeout; surface an error to the user if exceeded.
  - If the transcription service is unreachable (network error / non-2xx on connect), fall back gracefully with the existing subtitle-not-available message rather than throwing.
- [x] Add loading indicators in the Copilot frontend to display the current transcription step (`downloading` / `uploading` / `transcribing`) to the user.
- [x] Verify end-to-end flow: Copilot Web → audio-trainscript-service (Tailscale) → Gemini → SSE result displayed in UI.

---

## Future Todo Backlog (Deferred Features)
- [ ] **Bilibili subtitle overflow bug** (`bilibili-copilot-web`): The legacy `player/v2?aid=&cid=` API overflows 32-bit int for modern videos, returning subtitles from unrelated older videos. Fix: switch to `web-interface/view?bvid=` and read `.data.subtitle.list` directly.
- [ ] **Redis caching for ASR results**: Cache successful transcripts in Upstash Redis at `bilibili:subtitle:${bvid}:${page}` with a 7-day TTL to avoid re-transcribing the same video.
- [ ] **Google Drive Service**: Implement GDrive download utilizing Service Account `.json` credentials.
- [ ] **Local Upload Support**: Configure multipart uploads for `.m4a` files up to 100MB.
- [ ] **SQLite Persistence & TTL**:
  - Integrate `better-sqlite3` database.
  - Implement daily cron job executing `DELETE FROM transcripts WHERE created_at < DATETIME('now', '-2 years')`.

---

## Acceptance Criteria (Phase 1-3)

### 1. Bilibili Audio Fallback
- **Given** a Bilibili video URL that has no subtitles (e.g. uploader didn't supply them).
- **When** the `bilibili-copilot` app requests subtitles, and calls `POST http://localhost:port/api/transcribe`.
- **Then** the client receives an SSE stream showing progress: downloading $\rightarrow$ uploading $\rightarrow$ transcribing, and finally returns the JSON subtitle array.
- **Then** all temporary files (both local disk and Gemini cloud) are confirmed deleted.
