# Context: Comprehensive Request Logging

## 2026-06-01 — Feature initiated

**Decision**: Use BVID as the log correlation key, passed as an optional `tag?` string parameter to service functions.

**Why**: The BVID is available before any async work starts (it's a synchronous regex on the URL). Extracting it early in `index.ts` lets us prefix every log line — including those deep inside `bilibili.ts` and `gemini.ts` — with the same `[BV…]` token. No new logger abstraction is needed; `console.log` with a prefix is sufficient.

**Decision**: Use original filename as tag for `upload-transcribe` endpoint.

**Why**: The upload-transcribe path has no BVID. Using `req.file.originalname` gives a human-readable identifier without adding complexity. A UUID would work too but is less readable in logs.

**Decision**: Do not add a logger library.

**Why**: The existing codebase uses plain `console.log`/`console.error`. Introducing a library (Winston, Pino) would be scope creep — the goal is log coverage, not structured logging infrastructure.

**Open questions**: None. All design decisions made.
