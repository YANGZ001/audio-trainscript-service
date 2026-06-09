## Why

Users want to transcribe Chinese podcast episodes from Xiaoyuzhou (小宇宙), the most popular Chinese podcast platform (`xiaoyuzhoufm.com`). The service already handles Bilibili and Snipd; adding Xiaoyuzhou fills the most requested missing source for Chinese-language podcast transcription.

## What Changes

- Add URL detection for `xiaoyuzhoufm.com/episode/` URLs in the source router
- New service module to extract episode ID, parse the episode page's `__NEXT_DATA__` JSON for metadata + audio URL (no authentication required), and download the M4A
- New cache directory and Docker volume for Xiaoyuzhou audio files
- No new env vars — all episode data is embedded in the public page HTML

## Capabilities

### New Capabilities

- `xiaoyuzhou-episode-transcription`: Transcribe a Xiaoyuzhou podcast episode given its URL; fetches metadata and audio URL by parsing `__NEXT_DATA__` from the public episode page, caches the audio file, and returns a formatted transcript

### Modified Capabilities

- `audio-file-cache`: Add Xiaoyuzhou as a third cached source (new cache directory `/data/xiaoyuzhou-audio`, 90-day TTL, same pattern as existing Bilibili and Snipd caches)

## Impact

- **New file**: `src/services/xiaoyuzhou.ts`
- **Modified**: `src/index.ts` — `detectSource()`, cache dir constant, handler branch, type annotation
- **Modified**: `docker-compose.yml` — new named volume
- **New test**: `test/xiaoyuzhou/run.sh`
- **No new env vars or external API dependencies** — data is scraped from public page HTML
