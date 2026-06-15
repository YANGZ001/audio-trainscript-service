## Why

The async queue uses a single FIFO worker that is the only Gemini caller. If the head job's model has exhausted its daily cap, `waitForRateLimit` blocks the entire queue — including jobs that could run on a different model with available quota (head-of-line blocking). Transient provider `5xx` (`UNAVAILABLE`/"high demand") similarly stalls or fails a job even when another model is healthy. Each configured model has its own independent rate-limit bucket, so stepping down to the next model keeps the queue moving. There is no reason to make the user choose a model — the system can always pick the best available one.

## What Changes

- **Every queued job is transcribed using a configured fallback chain** (e.g. `gemini-3.1-flash-lite → gemini-2.5-flash-lite → gemini-3.5-flash → gemini-2.5-flash`). The worker tries chain models in order.
- The worker **skips** a model whose RPM/RPD is already spent (no waiting) and tries the next; it only **waits** when every model in the chain is exhausted.
- On a **transient 5xx** the worker **steps down** to the next chain model rather than retrying the same one; permanent errors still fail fast.
- **Remove the model picker entirely** — no model selection in the UI, and the `model` request field / `?model` query param and `GET /api/models` endpoint are removed. There is no per-job model choice anymore.
- The **fallback chain is defined in `config/rate-limits.json`**, keeping configuration data-driven.
- The job records **which model actually produced the transcript**.

## Capabilities

### New Capabilities
- `model-fallback`: the configured fallback chain and the rules the worker follows for every job — try chain models in order, skip on exhausted quota, step down on transient 5xx, wait only when all are exhausted, and record the model that produced the transcript.

### Modified Capabilities
- `gemini-rate-limit`: the worker no longer blocks on a single model; it advances through the fallback chain to the next model with available quota and waits only when the whole chain is exhausted.
- `asr-job-queue`: drop the per-job model override — `POST /api/jobs` accepts only `{ url }`, and a retried job re-enqueues just the source URL. (The SSE event contract of `/api/transcribe` is unchanged.)

## Impact

- **Code**: `src/config/rateLimits.ts` (read the chain; `getFallbackChain`, `hasQuota`), `src/queue/worker.ts` (always resolve via the chain: skip/step-down/wait), `src/index.ts` (remove `GET /api/models`; `POST /api/jobs` and `/api/transcribe` ignore/drop `model`), `public/index.html` (remove the picker and its `loadModels` wiring), `config/rate-limits.json` (new `fallback` chain), `src/db.ts` (record the produced model on the transcription; the now-unused `jobs.model` column is left in place, nullable).
- **Config**: `config/rate-limits.json` gains an ordered `fallback` array; documented in `README.md`.
- **Behavior**: jobs never stall the queue while any chain model has quota. The model picker disappears. `/api/transcribe`'s SSE contract is unchanged; only the (now ignored) `?model` param differs. `/api/upload-transcribe` stays synchronous and keeps using the Gemini default model (out of scope).
- **Specs**: new `model-fallback`; modified `gemini-rate-limit` and `asr-job-queue`.
