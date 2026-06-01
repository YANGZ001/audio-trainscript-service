# Audio Trainscript Service — Proposal

## Background

The Bilibili Copilot application currently fails with `"分析失败 字幕获取失败：该视频暂无可用字幕"` when analyzing videos that do not have uploader-provided or Bilibili-generated AI subtitles. To address this, we need a decoupled audio-to-text service that can extract the audio track of Bilibili videos and transcribe it.

This document partitions the project into an initial launch phase (Bilibili integration using Google's Gemini API) and deferred backlog features (direct uploads, Google Drive integration, and long-term SQLite archiving).

## Goals (Immediate Scope)

1. **Decoupled API-Only Service**: Build an independent audio transcription microservice (`audio-trainscript-service`) running in a separate Docker container.
2. **Bilibili Audio Ingestion**: Resolve and download audio streams directly from Bilibili videos using the existing browser session token.
3. **ASR using Gemini API**: Leverage Gemini 3.1 Flash Lite (via the Free Tier API) to perform high-quality, speech-to-text transcribing with timestamps.
4. **Real-Time Progress Tracking**: Stream transcription status updates (Downloading $\rightarrow$ Uploading to Gemini $\rightarrow$ Transcribing $\rightarrow$ Done) to the caller using Server-Sent Events (SSE).

## Future Todo / Backlog (Out of Scope for Initial Version)

1. **Google Drive Integration**: Pull files from Google Drive using Google Service Account authentication.
2. **Direct File Uploads**: Support multipart file uploads of `.m4a` interview/study recordings up to 100MB.
3. **Persistent SQLite Storage & TTL**: Archive transcripts in a local SQLite database with a 2-year TTL automatic expiration cleanup job.

## Non-Goals

- A complex frontend UI (this is a headless API-only service accessible via Tailscale internal network).
- Public-facing user accounts or authentication mechanisms (relies on Tailscale VPN network security).
- Real-time/live stream transcription (only processes batch audio files).

## Design Principles

- **Simplicity & Speed**: Focus first on solving the Bilibili Copilot subtitle fallback.
- **Resource Efficiency**: Use Gemini 3.1 Flash Lite's cloud capacity to transcribe audio, avoiding local GPU dependencies.
- **Strict Cleanup**: Delete all downloaded audio files immediately after transcription finishes.

## Constraints

- **Rate Limits**: The service must respect Google AI Studio Free Tier constraints (15 RPM / 1500 RPD).
- **Environment**: Deployed in a Docker container on a dedicated Ubuntu server located in Singapore, running within a private Tailscale network.
