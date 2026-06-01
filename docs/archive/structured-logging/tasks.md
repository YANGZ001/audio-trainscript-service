# Tasks: Structured Logging with pino

## Phase 1 — Infrastructure

- [x] Add `pino` to `dependencies` in `package.json`
- [x] Add `pino-pretty` and `@types/pino` to `devDependencies` in `package.json`
- [x] Create `src/logger.ts` singleton (ISO timestamp, LOG_LEVEL, pino-pretty in non-production)

## Phase 2 — Migration

- [x] Replace 9 console calls in `src/index.ts` with `logger.*` / child logger calls
- [x] Replace 10 console calls in `src/services/gemini.ts` with `logger.*` / child logger calls
- [x] Replace 6 console calls in `src/services/bilibili.ts` with `logger.*` / child logger calls

## Phase 3 — Verification

- [x] `docker compose up --build` — service starts without errors
- [x] JSON log lines appear with `time` field (confirmed in container stdout)
- [x] `bvid` and `fileTag` appear as structured fields by design (child logger pattern)
- [x] `LOG_LEVEL` env var wired to pino `level` option

## Acceptance Criteria

- Every log line in production output has a `time` field in ISO 8601 format. ✓
- `bvid` and `fileTag` values appear as structured JSON fields, not embedded in the `msg` string. ✓
- `LOG_LEVEL=debug` enables debug output; `LOG_LEVEL=info` (or unset) suppresses it. ✓
- Service builds and starts cleanly with `docker compose up --build`. ✓
- Zero new log call sites added; all 25 existing sites replaced. ✓
