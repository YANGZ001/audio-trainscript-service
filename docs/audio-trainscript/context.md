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

## Open Questions

- [ ] **Rate limiting strategy**: With 15 RPM free-tier cap, concurrent requests from multiple Copilot sessions could exceed quota. Consider a request queue or per-source backoff. Decision deferred until load is observed in practice.
- [ ] **Tailscale hostname**: Confirm the exact MagicDNS hostname of the Singapore server before wiring up Phase 3.
