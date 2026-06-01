# Tasks: Comprehensive Request Logging

## Phase 1 — Feature docs

- [x] Create `docs/request-logging/proposal.md`
- [x] Create `docs/request-logging/design.md`
- [x] Create `docs/request-logging/tasks.md`
- [x] Create `docs/request-logging/context.md`
- [x] Create `docs/request-logging/tests.md`

## Phase 2 — Implementation

- [x] `src/services/bilibili.ts`: add `tag?` param to `downloadBilibiliAudio`; add log lines at each step
- [x] `src/services/gemini.ts`: add `tag?` param to `transcribeAudio`; add log lines at each step
- [x] `src/index.ts`: call `extractBvid` early in `/api/transcribe`; add lifecycle logs; pass `tag` to both service calls; thread filename tag in `/api/upload-transcribe`

## Phase 3 — Verification

- [x] `docker compose up --build` succeeds without TypeScript errors
- [x] Send a real Bilibili request; confirm all expected `[BV…]` log lines appear in `docker compose logs`
- [x] Confirm error path logs include BVID prefix
- [x] Confirm `upload-transcribe` path logs include filename prefix

## Acceptance Criteria

- Running `grep BV16eSQYLEWa` in the docker compose logs for a request to that video shows log lines for every major stage: request received, BVID extracted, cid fetched, audio stream fetched, download start/end, Gemini upload, polling attempts, file ready, transcript received, done.
- No stage is silent (no gap longer than one processing step without a log line).
- Existing error log messages still appear; they now also carry the BVID prefix.
- `docker compose up --build` exits 0 with no TypeScript compiler errors.
