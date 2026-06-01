# Review Fixes — Context

## 2026-06-01 — Review findings documented

Code review of Phase 1 & 2 (commits `14f6f63`–`e9bfc50`) identified 13 issues.

Three are classified as hang/data-loss bugs:
- The `writer.destroy()` call on size-limit breach does not cause the Promise to reject in Node ≥14; the request hangs.
- The Gemini PROCESSING poll loop has no exit condition beyond the state changing.
- The orphan cleanup `createTime ?? 0` fallback causes all files without a timestamp to be treated as 1970-era and deleted on startup.

Four are correctness issues (silent failures, potential collisions, missing enforcement).

Three are infrastructure/security (Dockerfile EXPOSE mismatch, running as root, unauthenticated endpoints — the last is documented as acceptable for Tailscale-only deployments and will not be fixed here).

Two are tooling issues (test.sh URL injection, missing `fileInfo.uri` guard).

Decision: all fixes are surgical minimum edits. No new dependencies. Auth is intentionally deferred — the service is Tailscale-gated.

## Open Questions

- Audio duration enforcement (#7): enforcing a 3-hour cap requires inspecting the audio file after download (e.g. with `ffprobe`), which adds a native binary dependency to the container. Deferred to a separate task.
- No-progress-events for chunked download (#13): acceptable as-is; emitting an "unknown size" progress signal is UX polish, not a correctness issue. Deferred to Future Todo backlog.
