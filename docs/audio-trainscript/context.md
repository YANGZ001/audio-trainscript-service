# Audio Trainscript Service — Context

## Key Decisions

### 2026-06-01 — Service Naming & Scope Split

- **Service Rename**: Renamed the service from `audio-bridge-service` to `audio-trainscript-service` (and directories/docs updated accordingly).
- **Phased Scope Split**:
  - **Immediate Goal**: Focus on implementing the Bilibili ASR fallback using Google's Gemini 3.1 Flash Lite API (free tier). The service will remain stateless for this phase, deleting audio files immediately after completing transcription.
  - **Deferred (Todo Backlog)**: Moving direct file uploads (.m4a), Google Drive download (using Service Account), and persistent SQLite storage with a 2-year TTL cleanup job to the Future Todo backlog.
- **Security**: The service is hosted entirely within a private Tailscale network, making access control keys unnecessary.

### 2026-06-01 — Implementation Decisions

- **HTTP Framework**: Express (over Fastify) — familiar ecosystem, simpler SSE via `res.write()`.
- **Session Token Delivery**: `BILIBILI_SESSION_TOKEN` injected as an env var at container startup via `docker-compose.yml`. Token rotation requires a container restart.
- **Inter-service Networking**: `bilibili-copilot-web` calls this service using its Tailscale MagicDNS hostname. No shared Docker network needed.
- **Gemini Model ID**: `gemini-3.1-flash-lite` (Google AI Studio free tier).
- **Audio Limits**: 200MB file size / 3-hour duration cap enforced server-side.
- **Orphaned File Cleanup**: On startup, scan Gemini File API and delete any files older than 1 hour to recover from mid-request crashes.

---

### 2026-06-01 — Phase 3 Integration Decisions

- **Streaming protocol**: Extended the `summarize` route response stream with `PROGRESS:{"step":"...","progress":N}` prefix lines before the `===METADATA_END===` delimiter. Frontend strips these when parsing metadata JSON; real-time UI updates happen per-chunk.
- **ASR fallback trigger**: When `getSubtitleForVideo` returns `available: false` AND `AUDIO_TRANSCRIBE_SERVICE_URL` env var is set, the summarize route opens a 10-minute AbortController and calls `callTranscribeService()` inside a ReadableStream. On success, pipeDeepSeek is called with the ASR transcript text.
- **Tailscale hostname**: `zyfun-ubuntu26` (Tailscale IP: 100.105.9.62). `extra_hosts: - "zyfun-ubuntu26:host-gateway"` added to bilibili-copilot-web `docker-compose.yml` so the container can resolve the hostname without needing Tailscale inside Docker.
- **DeepSeek logic extracted**: The DeepSeek streaming logic was extracted into a `pipeDeepSeek()` helper in `summarize/route.ts` so the ASR path can reuse it without duplicating ~80 lines.
- **ERROR: signaling**: When ASR fails (abort, network error, or transcription error), an `ERROR:{"error":"..."}` line is written and the stream is closed. The frontend post-loop check catches this and throws to show the error to the user.
- **Title preservation**: Modified `getSubtitleForVideo` to preserve `videoTitle` in a variable outside the try/catch, so the actual video title is available in the error result (used as the ASR video title).

## Open Questions

- [ ] **Rate limiting strategy**: With 15 RPM free-tier cap, concurrent requests from multiple Copilot sessions could exceed quota. Consider a request queue or per-source backoff. Decision deferred until load is observed in practice.
- [x] **Tailscale hostname**: Resolved — `zyfun-ubuntu26`, accessible from Docker via `host-gateway` extra_hosts entry.
