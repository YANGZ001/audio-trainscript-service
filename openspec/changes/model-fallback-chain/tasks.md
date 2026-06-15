## 1. Config (`config/rate-limits.json`, `src/config/rateLimits.ts`)

- [x] 1.1 Add an ordered `fallback` array to `config/rate-limits.json` (e.g. `["gemini-3.1-flash-lite", "gemini-2.5-flash-lite", "gemini-3.5-flash", "gemini-2.5-flash"]`)
- [x] 1.2 Add `getFallbackChain(): string[]` (falls back to the Gemini default if missing/empty) to `rateLimits.ts`; `hasQuota(model)` lives in the worker where the time windows + `countApiCalls` already are
- [x] 1.3 Document the `fallback` chain in `README.md`

## 2. Data layer (`src/db.ts`)

- [x] 2.1 Add additive migration `ALTER TABLE transcriptions ADD COLUMN model TEXT` via the `MIGRATIONS` array; add `model` to `TranscriptionRow`
- [x] 2.2 Extend `insertTranscription` to persist the produced `model`
- [x] 2.3 Stop setting `jobs.model` in `enqueueJob` (leave the nullable column in place, unused)

## 3. Worker resolution (`src/queue/worker.ts`)

- [x] 3.1 Implement candidate selection: first untried chain model with quota (`hasQuota`)
- [x] 3.2 Implement `waitForSoonest(models)` — sleep until the earliest of the given models frees a slot (reuse the windowed counting cadence)
- [x] 3.3 Rewrite `processJob` to always run the chain loop: skip capped models, step down on transient 5xx (track tried models), wait only when all are capped, fail when the chain is exhausted
- [x] 3.4 Pass the resolved model into `insertTranscription` and the completion log; remove the old fixed-model `waitForRateLimit`/same-model retry path

## 4. API + frontend (`src/index.ts`, `public/index.html`)

- [x] 4.1 Remove `GET /api/models`
- [x] 4.2 `POST /api/jobs` accepts only `{ url }` (drop the `model` field); `/api/transcribe` no longer reads `?model`
- [x] 4.3 Remove the model `<select>` and `loadModels()` wiring from the frontend (upload tab no longer sends `?model`)
- [~] 4.4 (Optional) Surface the produced model in History — skipped; the model is recorded on the transcription row and in the completion log, but not shown in the History table (no UI change)

## 5. Verification

- [x] 5.1 `docker compose up --build`; UI has no model picker; `POST /api/jobs {url}` works
- [x] 5.2 Preferred model's quota exhausted (`gemini-3.1-flash-lite` rpd:1 via `RATE_LIMITS_PATH`) → job dispatched on `gemini-2.5-flash-lite` immediately, no stall; transcription/log recorded the resolved model
- [x] 5.3 Transient 503 on `gemini-3.1-flash-lite` → stepped down to `gemini-2.5-flash-lite` (observed in logs), completed and recorded on that model
- [~] 5.4 Entire chain capped → waits (logic verified by `waitForSoonest`; not force-tested since it requires capping all four models)
- [x] 5.5 `/api/transcribe` SSE contract unchanged; `?model` ignored
- [x] 5.6 `GET /api/models` removed (404); no picker references remain in the served HTML

## Acceptance criteria

- Every job transcribes using the best available chain model and never blocks the queue while any chain model has quota.
- A transient 5xx steps down to the next model rather than retrying the same one.
- There is no model picker, `model` field, `?model` param, or `/api/models` endpoint.
- The produced model is recorded and visible (History/log).
