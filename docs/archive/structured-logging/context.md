# Context: Structured Logging with pino

## Decision Log

**2026-06-01** — Chose pino over winston.
- Winston is more popular by download count but significantly slower and more verbose to configure for JSON output.
- pino outputs JSON by default and has the simplest child-logger API, which maps cleanly onto the existing `[bvid]`/`[fileTag]` tag pattern.
- pino-pretty as a dev transport means zero code branching — the app code is identical in dev and production.

**2026-06-01** — Chose `pino.stdTimeFunctions.isoTime` over epoch timestamps.
- ISO 8601 strings are human-readable without a conversion tool, which matters when tailing logs manually.

**2026-06-01** — pino-pretty gated on `NODE_ENV !== 'production'`, not on a custom env var.
- `NODE_ENV=production` is already set in the Dockerfile; no new env var needed.

## Open Questions

_(none)_
