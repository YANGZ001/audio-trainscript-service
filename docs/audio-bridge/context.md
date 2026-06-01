# Audio Bridge Service — Context

## Key Decisions

### 2026-06-01 — Architecture & Core Pipeline Aligned

- **Decoupled Architecture**: Decided to build the service as a separate Docker container (`audio-bridge-service`) running on a dedicated Ubuntu server. This avoids adding heavyweight Python/ASR dependencies or GPU configuration complexity to the main Next.js web application.
- **ASR Engine Selection**: Selected Gemini 1.5 Flash (via Google AI Studio Free Tier). It offers native audio inputs, extremely low latency, zero API costs (within free tier), and robust understanding of technical jargon/multilingual context (perfect for English/Chinese interview recordings).
- **Google Drive Authentication**: Selected the Google Cloud Service Account workflow. Sharing target Google Drive folders with the service account email is clean, secure, and fits a headless server deployment perfectly.
- **Security & Network**: Decided against adding active authentication (tokens/API Keys) to the microservice. The service is hosted entirely within a private Tailscale network (personal host, Singapore) and is not exposed to the public internet.
- **TTL Duration**: Set the transcription retention to exactly 2 years using a daily SQLite deletion query. Temp audio files will be deleted immediately after transcription finishes.
