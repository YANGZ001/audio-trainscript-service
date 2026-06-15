## Context

The merged `async-asr-queue` work gives us a single FIFO worker (`src/queue/worker.ts`) that is the only Gemini caller, with per-model RPM/RPD enforced from `config/rate-limits.json` via a durable `api_calls` ledger (`getRateLimit`, `countApiCalls`). Each model has its own bucket. Today a job pins one model: `processJob` computes `model = job.model ?? GEMINI_MODEL`, calls `waitForRateLimit(model)` (which **blocks** when capped), and retries the *same* model on transient 5xx. This causes head-of-line blocking and wastes a healthy alternative model on transient errors. There is also a model picker (UI `<select>` + `GET /api/models` + `?model`/`model` field) that we are removing — the system should always pick the best available model itself.

## Goals / Non-Goals

**Goals:**
- Every queued job is transcribed by walking a configured fallback chain.
- Skip a capped model (no wait), step down on transient 5xx, wait only when the whole chain is capped.
- Remove the model picker and all per-job model selection.
- Record which model actually produced each transcript.

**Non-Goals:**
- Any per-job or user-facing model choice (fully removed).
- Multi-worker / concurrency or priority.
- Fallback for `/api/upload-transcribe` (still synchronous, out of the queue; keeps the Gemini default model).

## Decisions

### No model selection anywhere — the chain is the only behavior
There is no "Auto vs explicit" branch. The picker, `GET /api/models`, the `model` body field on `POST /api/jobs`, and the `?model` query param on `/api/transcribe` are all removed. The worker always resolves the model from the chain. The existing `jobs.model` column is left in place (nullable, unused) to avoid a destructive migration; `enqueueJob` simply stops setting it.

### Chain in config, alongside the existing limits
`config/rate-limits.json` gains an ordered `fallback` array, e.g. `["gemini-3.1-flash-lite", "gemini-2.5-flash-lite", "gemini-3.5-flash", "gemini-2.5-flash"]`. `rateLimits.ts` exposes `getFallbackChain(): string[]` and `hasQuota(model): boolean` (reusing `getRateLimit` + `countApiCalls`). Chain entries should be real configured models; unknown ones fall back to `default` limits. If the chain is missing/empty, fall back to the Gemini default model so the worker still functions.

### Worker resolves the model per attempt from the chain
`processJob` always runs the chain algorithm (no branch):

```
chain = getFallbackChain(); tried = new Set()
loop:
  candidate = chain.find(m => !tried.has(m) && hasQuota(m))
  if !candidate:
    remaining = chain.filter(m => !tried.has(m))
    if remaining empty -> throw lastErr     // every model tried/errored -> fail
    candidate = await waitForSoonest(remaining)   // all capped: wait for the first to free
  logApiCall(candidate)
  try: transcribe with candidate; record produced model; markDone; return
  catch err:
    if isRetryable(err) and tried.size+1 < chain.length: tried.add(candidate); continue  // step down
    throw err
```

A **capped** model is *skipped* (not added to `tried`, so it can be reconsidered after a wait); a model that **errored** is added to `tried` (don't reuse it for this job). `waitForSoonest` reuses the existing windowed counting cadence to sleep until the earliest of the remaining models frees a slot. This replaces the old fixed-model `waitForRateLimit` + same-model retry in the worker.

### Record the produced model
Add a nullable `model TEXT` column to `transcriptions` via the existing additive `MIGRATIONS` array (`ALTER TABLE … ADD COLUMN`). `insertTranscription` records the resolved chain model, so History can show it. The completion log already includes the model.

### Frontend
Remove the model `<select>` and `loadModels()` entirely; the submit flow just posts `{ url }`. Optionally surface the produced model in History (now on the transcription row).

## Risks / Trade-offs

- **Quality variance across the chain** → A job may land on a weaker model under load. Mitigated by ordering the chain best-first; recording the produced model makes it visible.
- **`waitForSoonest` complexity** → Computing the earliest free slot across N models is more involved than single-model waiting; keep it conservative (re-poll on an interval like the existing limiter) rather than precise.
- **`/api/transcribe?model=` now ignored** → A programmatic caller passing `?model` no longer changes the model. The SSE event contract is unchanged; only model pinning is gone. Acceptable per the "Auto for everything" decision.
- **`transcriptions` migration** → Additive `ADD COLUMN` is safe and already supported by the migrations runner; existing rows get `NULL`.

## Migration Plan

- Additive only: new `fallback` config key and an additive `transcriptions.model` column; the unused `jobs.model` column is retained. Normal `docker compose up --build`.
- Rollback is reverting the image; the new column/key are inert if unused.

## Open Questions

None — model selection is fully removed; every job uses the chain.
