## Context

The service is a single Node/Express process backed by SQLite (`better-sqlite3`, WAL, `globalThis` singleton). Today `/api/transcribe` runs the whole pipeline inline over an SSE connection across three near-identical source branches (Bilibili / Snipd / Xiaoyuzhou), each doing cache-check → metadata → download → `transcribeAudio` (one `generateContent` call). There is no queue and no rate limiting, while Gemini's free tier enforces tight per-model RPM/RPD (see `rate-limit.md`). An external consumer, `bilibili-copilot`, depends on the current `/api/transcribe` SSE contract.

## Goals / Non-Goals

**Goals:**
- Persistent, restart-safe queue for URL transcription jobs.
- Single worker that is the only Gemini caller for queued jobs, draining strictly FIFO.
- Per-model RPM + RPD enforcement from a config file, with durable accounting.
- Preserve the `/api/transcribe` SSE contract exactly (zero changes for `bilibili-copilot`).
- UI submits to the queue and polls per-job status; results land in existing History.

**Non-Goals:**
- File-upload (`/api/upload-transcribe`) queueing — stays synchronous (known gap: still calls Gemini directly).
- Token-per-minute (TPM) enforcement — token estimation is unreliable.
- Multi-worker / concurrent transcription, priority, or distributed queue.

## Decisions

### Single in-process worker loop
A single async loop started at boot polls the DB for the oldest `queued` job, processes it, and repeats. Chosen over a separate worker process or external queue (BullMQ/Redis) because the deploy is one container and concurrency is intentionally one — extra infrastructure would violate simplicity-first. SQLite is the queue.

### SQLite-backed queue with two additive tables
Add `jobs` (lifecycle, stage, progress, error, `transcription_id`) and `api_calls` (model, ts ledger) to the existing DB. Additive `CREATE TABLE IF NOT EXISTS` — no change to `transcriptions`. `claimNextJob` selects `WHERE status='queued' ORDER BY created_at ASC LIMIT 1` and flips it to `processing` in one statement. Durability across restart comes for free.

### `/api/transcribe` becomes a wrapper that tails its job
The endpoint enqueues a job, then polls that job row (~500 ms) and translates `stage`/`progress`/`status` into the existing SSE events, reading the final transcript via the linked `transcription_id`. Chosen over an in-memory `EventEmitter` bridge: polling is simpler, has adequate latency for multi-second jobs, and survives the worker/handler being decoupled. Unifying everything through the queue means the worker is the *sole* Gemini caller, so rate limits can't be bypassed.

### Extract one reusable pipeline
Collapse the three inlined source branches in `index.ts` into `transcribeFromUrl(url, model, { onStage, onDownloadProgress })` in a new `src/services/transcribePipeline.ts`, moving the cache helpers and cache-dir constants with it. Both the worker (writes callbacks to the job row) and the wrapper (turns them into SSE) call it. This is a deliberate refactor because shared reuse is the whole point; transcription behavior is unchanged.

### Rate limiter driven by a durable ledger
`config/rate-limits.json` maps model → `{rpm, rpd}` with a `default`. The model picker is populated from `/api/models` (the configured model IDs) so the UI and limits stay in sync. Before dispatch, `waitForRateLimit(model)` counts `api_calls` rows in the trailing 60 s and 24 h; if either is at the cap it sleeps until the oldest relevant row ages out, then re-checks. A rolling 24 h window is used for RPD (conservative — never exceeds the cap) rather than a Pacific calendar-day reset, trading a slightly stricter limit for much simpler, timezone-free logic. Each dispatch writes an `api_calls` row; rows older than 24 h are pruned opportunistically.

### Frontend: enqueue + poll, retire live output panel
Submit posts to `POST /api/jobs`; a new queue panel polls `GET /api/jobs` every few seconds and renders per-job status/stage/progress with a cancel action. On `done`, the existing History list refreshes. The live output panel (`index.html` progress/status/textarea/`Copy All`) is commented out (project convention), and the orphaned SSE/copy JS is removed.

## Risks / Trade-offs

- **FIFO starves interactive callers** → A `bilibili-copilot` request can wait behind a queued batch. Accepted per the locked FIFO decision; revisit with priority if it bites.
- **Upload path bypasses the limiter** → `/api/upload-transcribe` can still independently exhaust quota. Documented as a known gap; minimal future fix is to have it call `waitForRateLimit` + log a request.
- **Rolling-window RPD is stricter than Gemini's calendar-day reset** → Slightly fewer requests/day than theoretically allowed. Acceptable; favors never hitting 429.
- **Mild race if a non-worker path ever shares the limiter** → Not a concern now (worker is the sole caller); only relevant if the upload gap is later closed without coordination.
- **Bounded transient retry** → The worker retries transient failures (provider 429/5xx, network) up to 3 attempts with exponential backoff; permanent errors (4xx/auth/validation) fail fast. Each retry is gated and counted against the rate limits. A job that exhausts retries is marked `failed` with a clean message, and the UI offers Retry/Dismiss.

## Migration Plan

- Additive schema only; existing `transcriptions` data and the `/api/transcribe` contract are untouched, so deploy is a normal `docker compose up --build`.
- Ship `config/rate-limits.json` with conservative free-tier defaults; document in `.env.example` / `README.md`.
- Rollback is reverting the image — the new tables are inert if unused.

## Open Questions

None outstanding — scope, ordering (FIFO), limits (RPM+RPD), and backward-compat (wrapper) are locked with the user.
