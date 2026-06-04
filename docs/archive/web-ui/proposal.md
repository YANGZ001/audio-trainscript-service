# Web UI — Proposal

## Background

The service exposes two POST endpoints (`/api/transcribe`, `/api/upload-transcribe`) that stream SSE progress events. Operators access them today via `curl` or shell scripts. Windows users cannot reuse those scripts, and the environmental differences (path separators, `curl` flags, shell quoting) create friction. A browser-based UI eliminates OS differences entirely.

## Goals

- Provide a single-page UI served by the existing Express server
- Support Bilibili URL input and local `.m4a` file upload
- Show real-time progress during download / upload / transcription
- Display the finished transcript as plain text with a one-click copy action
- Include a model selector so power users can choose the Gemini model

## Non-Goals

- Google Drive integration (removed as planned; file upload covers that use case)
- Authentication or access control
- Persisting transcripts (no database or local storage)
- Any backend changes (no modifications to `gemini.ts` or the SSE event format)

## Design Principles

- Minimum viable UI — single HTML file, no build step, no new runtime dependencies
- Serve from the existing container; no new service or Docker container
- Degrade gracefully if the server is unreachable (show a clear error, don't hang)

## Constraints

- Must work in a modern Chromium-based browser (Chrome, Edge) and Firefox
- POST + SSE requires `fetch()` + `ReadableStream` (native `EventSource` only handles GET)
- The server already runs on port 3000 (default) behind Tailscale; the UI is served from the same origin so no CORS concerns
