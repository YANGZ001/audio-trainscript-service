# Audio Trainscript Service — Tasks

## Phase 1: Infrastructure & Downloader Setup
- [ ] Initialize Node.js TypeScript project.
- [ ] Set up Dockerfile and `docker-compose.yml` configurations.
- [ ] Implement Bilibili audio downloader resolving playurl audio stream via B站 player/playurl API.
- [ ] Support utilizing the existing `BILIBILI_SESSION_TOKEN` cookie to resolve restricted/high-definition audio streams.

## Phase 2: Gemini Integration & Server-Sent Events (SSE)
- [ ] Integrate `@google/generativeai` SDK.
- [ ] Implement file upload to Gemini File API and ensure garbage collection (deleting both local temp file and Google cloud file after request completion).
- [ ] Write system prompt instructing Gemini 1.5 Flash to return a structured JSON array of timestamps and content.
- [ ] Implement Express/Fastify API server with `POST /api/transcribe` streaming progress using Server-Sent Events.

## Phase 3: Copilot Web Integration
- [ ] Update `bilibili-copilot-web`'s `lib/bilibili.ts` to call this new service on subtitle lookup failure.
- [ ] Add loading indicators in the Copilot frontend to display the current transcription step to the user.

---

## Future Todo Backlog (Deferred Features)
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
