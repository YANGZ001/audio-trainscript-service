# Audio Bridge Service — Proposal

## Background

The Bilibili Copilot application currently fails with `"分析失败 字幕获取失败：该视频暂无可用字幕"` when analyzing videos that do not have uploader-provided or Bilibili-generated AI subtitles. Additionally, the user frequently needs to transcribe and analyze personal study and interview recordings (typically `.m4a` files, 20–100MB, ~1 hour duration) but lacks a generic, self-hosted, private audio-to-text service.

## Goals

1. **Decoupled API-Only Service**: Build an independent audio transcription microservice (`audio-bridge-service`) running in a separate Docker container.
2. **Multi-Source Audio Ingestion**:
   - Resolve and download audio streams directly from Bilibili videos using the existing browser session token.
   - Access and download private audio files from Google Drive using Google Service Account authentication.
   - Support direct multipart file uploads of `.m4a` recordings up to 100MB.
3. **High-Accuracy & Cost-Effective ASR**: Leverage Gemini 1.5 Flash (via the Free Tier API) to perform high-quality, multimodal speech-to-text transcribing with timestamps.
4. **Real-Time Progress Tracking**: Stream transcription status updates (Downloading $\rightarrow$ Uploading to Gemini $\rightarrow$ Transcribing $\rightarrow$ Done) to the caller using Server-Sent Events (SSE).
5. **Persistent Storage with TTL**: Store JSON transcripts in SQLite on the local host with a 2-year retention policy (automatically deleted after 2 years).

## Non-Goals

- A complex frontend UI (this is a headless API-only service accessible via Tailscale internal network).
- Public-facing user accounts or authentication mechanisms (relies on Tailscale VPN network security).
- Real-time/live stream transcription (only processes batch audio files).

## Design Principles

- **Separation of Concerns**: Decouple the transcription workload from the main Next.js web application to keep the codebase clean and avoid GPU/model installation complexity.
- **Resource Efficiency**: Use Gemini 1.5 Flash's cloud TPU/GPU capacity to transcribe audio, avoiding complex local GPU docker-passthrough configurations.
- **Zero-Maintenance Storage**: Utilize SQLite for zero-dependency local storage.

## Constraints

- **File Limits**: Maximum input file size is capped at 100MB (matching Gemini API File Upload and local disk storage capacity).
- **Rate Limits**: The service must respect Google AI Studio Free Tier constraints (15 RPM / 1500 RPD).
- **Environment**: Deployed in a Docker container on a dedicated Ubuntu server located in Singapore, running within a private Tailscale network.
