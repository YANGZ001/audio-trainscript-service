# Proposal: Comprehensive Request Logging

## Background

The service currently emits only 7 log statements across 3 source files, covering only startup and error paths. A Bilibili transcription request passes through BVID extraction, two Bilibili API calls, an audio download, a Gemini file upload, file-state polling, content generation, and cleanup — all silently. When something goes wrong (slow download, stuck polling, Gemini failure), there is no way to determine where in the pipeline the request is or was.

## Goals

- Log every major stage of a request lifecycle so the progress of a single video can be tracked end-to-end.
- Use the Bilibili video ID (BVID, e.g. `BV16eSQYLEWa`) as a correlation key in every log line.
- Include useful context in each log line: elapsed time where meaningful, byte counts, attempt numbers, model name.

## Non-Goals

- No structured logging library (JSON logs, Winston, Pino, etc.) — plain `console.log` with a `[tag]` prefix.
- No log levels or log filtering configuration.
- No centralized logging infrastructure (e.g., Datadog, CloudWatch).
- No changes to the SSE event format visible to clients.
- No changes to the `upload-transcribe` endpoint's core behavior (it does not have a BVID; the original filename is used as the tag).

## Design Principles

- **Simplicity first**: one-liner `console.log` additions, no new abstractions.
- **Surgical changes**: touch only the three source files; match existing style.
- **Correlation by BVID**: every log line for a given request shares the same `[BV…]` prefix, making `grep BV16eSQYLEWa` in `docker compose logs` sufficient for full trace.

## Constraints

- Must not break existing TypeScript compilation.
- Must not change any public API signatures in a breaking way (only add optional `tag?` params).
- Deployment: Docker Compose via `docker compose up --build`.
