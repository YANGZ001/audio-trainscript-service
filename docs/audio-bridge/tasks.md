# Audio Bridge Service — Tasks

## Phase 1: Infrastructure & Database Setup
- [ ] Initialize project with TypeScript and ESLint configuration.
- [ ] Set up Dockerfile and `docker-compose.yml` supporting local persistent volume at `/data` for SQLite.
- [ ] Implement SQLite database initialization singleton (`src/db/index.ts`) and create `schema.sql`.
- [ ] Write DB helper functions to insert transcripts, retrieve them, and delete expired records (2-year TTL).
- [ ] Setup Cron Job scheduler (`src/cron.ts`) to run nightly cleanup queries.

## Phase 2: Ingestion & Downloader Services
- [ ] Implement Bilibili audio downloader resolving the lowest-quality DASH audio track using a given cookie.
- [ ] Implement Google Drive downloader utilizing a local `service-account.json` credential file to pull files from shared folders.
- [ ] Set up Express/Fastify multipart form-data middleware to receive direct `.m4a` file uploads up to 100MB.

## Phase 3: Gemini ASR Integration
- [ ] Integrate `@google/generativeai` SDK into the codebase.
- [ ] Implement helper to upload files to the Gemini File API and clean them up afterward.
- [ ] Craft structured Prompt instructing Gemini 1.5 Flash to output a strict JSON array with `from`, `to`, and `content`.
- [ ] Set up SSE (Server-Sent Events) route handler to output real-time progress events.

## Phase 4: Integration & Client Integration
- [ ] Test entire flow with mock inputs and log performance/durations.
- [ ] Connect the existing `bilibili-copilot-web` application's fallback route to call this new service when no subtitles are found.
- [ ] Verify that all temporary files (both local disk and Google File API) are properly garbage collected.

---

## Acceptance Criteria

### 1. Bilibili Audio Fallback
- **Given** a Bilibili video URL that has no subtitles (e.g. uploader didn't supply them).
- **When** the `bilibili-copilot` app requests subtitles, and calls `POST http://localhost:port/api/transcribe`.
- **Then** the client receives an SSE stream showing progress: downloading $\rightarrow$ uploading $\rightarrow$ transcribing, and finally returns the JSON subtitle array, caching it in SQLite.

### 2. Google Drive / Direct Upload ASR
- **Given** an `.m4a` file of up to 1 hour length (max 100MB) uploaded directly, or a Google Drive file ID.
- **When** calling the `/api/transcribe` endpoint.
- **Then** the transcript is correctly generated, and saved to SQLite with a creation timestamp that will trigger deletion exactly 2 years later.
