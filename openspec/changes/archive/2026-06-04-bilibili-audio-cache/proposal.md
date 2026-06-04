## Why

Every `/api/transcribe` request re-downloads the audio file from Bilibili CDN regardless of whether the same video was fetched before. This slows down development iteration and risks hitting Bilibili CDN rate limits when testing the same video repeatedly.

## What Changes

- Audio files fetched from Bilibili are stored in a named Docker volume and reused on subsequent requests for the same `bvid`
- Cached files expire after 90 days (lazy check on `mtime`); stale files are overwritten on next access
- The Bilibili handler in `/api/transcribe` reads directly from the cache path — no copy to tmpdir
- `docker-compose.yml` gains a named volume `bilibili-audio-cache` mounted at `/data/bilibili-audio`
- `/api/upload-transcribe` is unchanged

## Capabilities

### New Capabilities
- `bilibili-audio-cache`: Local disk cache for Bilibili audio files keyed by `bvid`, backed by a named Docker volume, with 90-day TTL lazy eviction

### Modified Capabilities
<!-- No existing spec-level behavior changes -->

## Impact

- **`src/index.ts`**: Bilibili handler resolves audio path from cache before downloading; `finally` block no longer deletes the audio file
- **`docker-compose.yml`**: New named volume definition and mount
- **No new dependencies**: uses Node.js built-in `fs.statSync` for TTL check
- **No API contract changes**: SSE event shape is unchanged; `downloading` events are simply skipped on cache hit
