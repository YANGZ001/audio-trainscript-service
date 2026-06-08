## Why

The service only supports Bilibili as an audio source. Users want to transcribe full podcast episodes shared via Snipd (`share.snipd.com/episode/<uuid>`), enabling the same interview-analysis workflow for podcast content.

## What Changes

- Add `src/services/snipd.ts` — new source module that fetches a Snipd share page, extracts the underlying podcast MP3 URL and episode metadata from the embedded `__NEXT_DATA__` JSON, and streams the audio to disk.
- **BREAKING** Replace the explicit `type` field in `POST /api/transcribe` with URL-based source auto-detection. The server inspects the URL and routes to the appropriate source module (`bilibili.com`/`b23.tv` → Bilibili; `share.snipd.com/episode/` → Snipd). Clients send only `{ "url": "..." }`.
- Generalize the audio cache from Bilibili-specific to source-agnostic: rename the cache capability to `audio-file-cache`, with per-source subdirectories (`/data/bilibili-audio/`, `/data/snipd-audio/`) and a shared 90-day TTL policy.
- Update `Dockerfile` and `docker-compose.yml` to create and mount the new Snipd cache directory.
- No new environment variables needed — Snipd share pages are publicly accessible.

## Capabilities

### New Capabilities

- `snipd-episode-transcription`: Accept a `share.snipd.com/episode/<uuid>` URL, resolve the underlying podcast MP3, download and cache it, and transcribe it via Gemini with episode metadata (title, podcast name, description, duration, category) injected into the prompt.

### Modified Capabilities

- `bilibili-audio-cache` → renamed to `audio-file-cache`: Generalize the caching requirement from Bilibili-only to all audio sources. Policy (90-day TTL, source-keyed files, Docker volume) stays the same; scope expands to cover any future source alongside Bilibili and Snipd.

## Impact

- **API (BREAKING)**: `POST /api/transcribe` drops the `type` field; source is inferred from the URL. Unknown URLs return HTTP 400.
- **New file**: `src/services/snipd.ts`
- **Modified files**: `src/index.ts`, `Dockerfile`, `docker-compose.yml`
- **Infrastructure**: New Docker named volume `snipd-audio-cache` → `/data/snipd-audio/`
- **Risk**: Snipd's share pages are behind Cloudflare bot protection; browser-like request headers are used and a graceful 403 error is surfaced to the client if blocked.
