## 1. Data layer (`src/db.ts`)

- [x] 1.1 Add `jobs` table schema (id, source_type, source_url, model, status, stage, progress, error, transcription_id, created_at, updated_at) via additive `CREATE TABLE IF NOT EXISTS`
- [x] 1.2 Add `api_calls` ledger table schema (id, model, ts)
- [x] 1.3 Add `Job` TypeScript interface and prepared statements
- [x] 1.4 Implement `enqueueJob`, `claimNextJob` (oldest queued → processing atomically), `setJobStage`, `markJobDone(id, transcriptionId)`, `markJobFailed(id, error)`, `listJobs`, `getJob`, `cancelJob` (queued only)
- [x] 1.5 Implement `logApiCall(model)`, `countApiCalls(model, sinceMs)`, opportunistic prune of `api_calls` older than 24h, and `getTranscription(id)`

## 2. Reusable transcription pipeline (`src/services/transcribePipeline.ts`)

- [x] 2.1 Move cache helpers (`isCacheHit`, `readCachedMeta`, `writeCachedMeta`) and cache-dir constants out of `index.ts` into the pipeline module
- [x] 2.2 Implement `transcribeFromUrl(url, model, { onStage, onDownloadProgress })` collapsing the three source branches; return `{ source_type, transcript, meta }`
- [x] 2.3 Verify no transcription behavior change (same cache, metadata, download, `transcribeAudio` flow) for all three sources

## 3. Rate limiter config (`src/config/rateLimits.ts`, `config/rate-limits.json`)

- [x] 3.1 Create `config/rate-limits.json` with `default` and per-model `{rpm, rpd}` using conservative free-tier values from `rate-limit.md`
- [x] 3.2 Implement config loader (path overridable via env) returning limits for a model with default fallback
- [x] 3.3 Document the config file in `.env.example` / `README.md`

## 4. Worker + rate limiting (`src/queue/worker.ts`)

- [x] 4.1 Implement `waitForRateLimit(model)` using `countApiCalls` over trailing 60s (RPM) and 24h (RPD); sleep until oldest relevant call ages out, then re-check
- [x] 4.2 Implement the worker loop: `claimNextJob` → `waitForRateLimit` → `logApiCall` → run `transcribeFromUrl` (writing stage/progress to the job) → `insertTranscription` + `markJobDone`, or `markJobFailed`; idle-sleep when queue empty
- [x] 4.3 Start the worker once at boot from `index.ts`

## 5. API endpoints (`src/index.ts`)

- [x] 5.1 Add `POST /api/jobs` — validate + `detectSource`, `enqueueJob`, respond `201 { id, status }`
- [x] 5.2 Add `GET /api/jobs` — return `listJobs()`
- [x] 5.3 Add `DELETE /api/jobs/:id` — `cancelJob` (queued only)
- [x] 5.4 Rewrite `POST /api/transcribe` as a wrapper: enqueue, then poll the job row (~500ms) translating stage/progress/status into the existing SSE events; send `done` with transcript from linked transcription, `error` on failure; keep running on client disconnect
- [x] 5.5 Remove the three now-inlined source branches; confirm `detectSource`, upload, and history routes still work

## 6. Frontend (`public/index.html`)

- [x] 6.1 Change the URL submit handler to `POST /api/jobs` instead of opening an SSE stream (file-upload tab keeps its synchronous SSE flow)
- [x] 6.2 Add a queue panel that polls `GET /api/jobs` every few seconds, rendering per-job status/stage/progress and a cancel button for queued jobs
- [x] 6.3 On a job reaching `done`, refresh the existing History list
- [x] 6.4 Gate the live output panel to the File Upload tab only (URL results go to queue + History); per the upload-output decision the panel is retained (not removed) since uploads aren't persisted; removed the orphaned `lastTranscriptionWasUrl` wiring

## 7. Retry & failed-job actions

- [x] 7a.1 Worker retries transient errors (provider 429/5xx, network codes) up to 3 attempts with exponential backoff; permanent errors fail fast; each retry gated + counted against limits
- [x] 7a.2 Store a clean human-readable error (`errMessage`) instead of the raw provider JSON blob
- [x] 7a.3 Broaden `DELETE /api/jobs/:id` to remove `failed` jobs (dismiss) as well as `queued` (cancel); `processing` → 409
- [x] 7a.4 Queue panel shows Retry + Dismiss on failed rows; Retry re-enqueues same URL+model and removes the old failed row

## 7b. Code-review follow-ups (PR #25)

- [x] 7b.1 `GET /api/jobs` excludes `done` jobs; worker prunes `done` rows after a 60s TTL so the polling payload and table stay bounded (frontend detects completion by an active job vanishing)
- [x] 7b.2 `busy_timeout=5000` pragma so a write never loses a completed transcript to a transient SQLITE_BUSY lock blip
- [x] 7b.3 Stop retrying provider `429` (rate limiting is owned by `waitForRateLimit`); retry only 5xx + network errors
- [x] 7b.4 README notes the rate-limit config is read once at startup (restart after editing)

## 8. Verification

- [x] 7.1 `docker compose up --build`; service listens on 3001
- [x] 7.2 `POST /api/jobs` with `BV1Xu411f7TR` → queued → processing → done; transcript appears in `GET /api/transcriptions` (linked transcription_id=16)
- [x] 7.3 Set tiny rpd in config (override via `RATE_LIMITS_PATH`) → worker logged `rate limit reached, waiting (inDay=3, rpd=2)` and held the job before calling Gemini; resumed after restoring limits
- [x] 7.4 `curl -N` `POST /api/transcribe` → identical SSE events (`uploading`/`transcribing`/`done` with transcript); jobs complete independently of any tailing client (FIFO). Restart recovery: orphaned `processing` jobs are requeued at boot
- [x] 7.5 Frontend served with queue panel + url-status; URL submit posts to `/api/jobs`; output panel gated to File tab; cancel returns 204 (queued) / 409 (processing)
