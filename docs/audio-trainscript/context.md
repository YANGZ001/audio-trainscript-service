# Audio Trainscript Service — Context

## Key Decisions

### 2026-06-01 — Service Naming & Scope Split

- **Service Rename**: Renamed the service from `audio-bridge-service` to `audio-trainscript-service` (and directories/docs updated accordingly).
- **Phased Scope Split**:
  - **Immediate Goal**: Focus on implementing the Bilibili ASR fallback using Google's Gemini 3.1 Flash Lite API (free tier). The service will remain stateless for this phase, deleting audio files immediately after completing transcription.
  - **Deferred (Todo Backlog)**: Moving direct file uploads (.m4a), Google Drive download (using Service Account), and persistent SQLite storage with a 2-year TTL cleanup job to the Future Todo backlog.
- **Security**: The service is hosted entirely within a private Tailscale network, making access control keys unnecessary.
