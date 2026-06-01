# Proposal: Structured Logging with pino

## Background

The service today logs via raw `console.log("[LEVEL] [tag] message")` calls across three source files (index.ts, gemini.ts, bilibili.ts — 25 call sites). Every line is a freeform string with no machine-readable structure, no timestamp, and no consistent schema. Debugging a failed request requires grepping through unindexed text and mentally reconstructing wall-clock timing.

## Goals

- Every log line carries an ISO 8601 timestamp.
- Logs are structured JSON in production (ready for Loki, ELK, or any log aggregator without a parsing rule).
- Request context (bvid, fileTag) appears as a top-level JSON field rather than an inline bracket tag.
- `LOG_LEVEL` environment variable controls verbosity at runtime.
- Local/dev output is human-readable with colors and formatted timestamps — no code change required to switch modes.

## Non-Goals

- Log shipping or aggregator configuration (out of scope).
- Distributed request-ID tracing across services.
- Log rotation or file-based output.
- Adding new log call sites beyond replacing the existing 25.

## Design Principles

- **Minimal surface area**: one singleton logger module (`src/logger.ts`), no wrapper classes or factory functions.
- **Exact replacement**: each existing `console.log/error/warn` becomes exactly one `logger.info/error/warn/debug` call at the same line — no extra log calls, no removed log calls.
- **Zero production overhead from dev tooling**: pino-pretty is never loaded in the Docker container.

## Constraints

- Runs in Docker (`NODE_ENV=production`); JSON output must work without any native add-ons.
- TypeScript 5.5, Node.js 22, CommonJS output.
- Build tooling: `docker compose up --build` only (no local `npm run build`).
