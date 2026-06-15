## Why

`/api/transcribe` is fully synchronous: the client holds an SSE connection through download → Gemini upload → transcription, and there is no rate-limit handling anywhere. Gemini's free tier enforces strict per-model RPM and RPD caps, so submitting several jobs — or running a second consumer like `bilibili-copilot` alongside the UI — reliably exhausts the quota and fails.

## What Changes

- Add a persistent, SQLite-backed **job queue** for URL transcription tasks (Bilibili / Snipd / Xiaoyuzhou).
- Add a single in-process **worker** that drains the queue in strict FIFO order; it becomes the **only** code path that calls Gemini for URL jobs.
- Enforce per-model **RPM + RPD** limits read from a config file; the worker waits when a limit would be exceeded.
- New endpoints: `POST /api/jobs` (enqueue, returns id immediately), `GET /api/jobs` (list status), `DELETE /api/jobs/:id` (cancel a queued job).
- Rewrite `POST /api/transcribe` as a backward-compatible SSE wrapper that enqueues a job and tails it — **the SSE contract is unchanged**, so `bilibili-copilot` needs no changes.
- Frontend submits to the queue and **polls `GET /api/jobs`** for per-job status/stage/progress; completed results appear in the existing History panel.
- Retire the live transcript output panel in the UI (progress bar, status row, `#transcript` textarea, `Copy All`) — superseded by the queue panel + History. Commented out per project convention, not deleted.
- `/api/upload-transcribe` stays synchronous and out of scope (known gap: it still calls Gemini directly).

## Capabilities

### New Capabilities
- `asr-job-queue`: persistent job lifecycle (queued → processing → done/failed), the FIFO single worker, the `/api/jobs` endpoints, and the backward-compatible `/api/transcribe` wrapper that enqueues + tails a job.
- `gemini-rate-limit`: per-model RPM + RPD enforcement driven by a config file and a durable request ledger; the worker blocks until a request slot is available.

### Modified Capabilities
<!-- None — existing source-transcription specs are unchanged; the produced transcript and SSE event shape stay identical. -->

## Impact

- **Code**: `src/db.ts` (new `jobs` + `api_calls` tables and CRUD), new `src/services/transcribePipeline.ts` (extracted from the three inlined branches in `src/index.ts`), new `src/queue/worker.ts`, new `src/config/rateLimits.ts`, rewritten routes in `src/index.ts`, queue panel in `public/index.html`.
- **Config**: new `config/rate-limits.json` (per-model `{rpm, rpd}` + default), documented in `.env.example` / `README.md`.
- **APIs**: new `/api/jobs` family; `/api/transcribe` contract preserved.
- **Data**: SQLite schema gains two additive tables; no changes to `transcriptions`.
- **Consumers**: `bilibili-copilot` unaffected (same SSE contract); UI behavior changes from live stream to enqueue + poll.
