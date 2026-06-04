## Context

Every `/api/transcribe` request downloads the Bilibili audio file fresh from CDN into `os.tmpdir()`, passes it to Gemini, then deletes it. For development iteration against the same video, this means repeated ~30s downloads and exposure to CDN rate limiting. Audio files are deterministic (same `bvid` → same bytes), making them ideal cache candidates.

## Goals / Non-Goals

**Goals:**
- Eliminate redundant downloads for the same `bvid` during development and production use
- Persist cache across container restarts via a named Docker volume
- Evict stale entries after 90 days via lazy `mtime` check

**Non-Goals:**
- Transcript caching (LLM output is non-deterministic; caching would prevent re-generation)
- Active cache eviction / background cleanup job
- Cache size limits or LRU eviction
- Environment-variable opt-in/opt-out (always on)

## Decisions

### Cache path: `/data/bilibili-audio/${bvid}.m4a`
`bvid` is already extracted at the top of the handler and uniquely identifies the video content. Using it directly as the filename avoids a hash step and keeps cache files human-inspectable.

### Download directly to cache path (no tmpdir for Bilibili flow)
On a cache miss, `downloadBilibiliAudio` writes to the cache path rather than a random tmpdir path. This avoids a copy step and means the file is ready to serve immediately after download without an extra rename/move.

**Alternative considered**: download to tmpdir, then `fs.rename` to cache path. Rejected — adds complexity and an extra syscall for no benefit in a single-container deployment.

### Cache hit: pass cache path directly to `transcribeAudio`
The handler resolves `audioPath` to the cache file, then passes it straight to `transcribeAudio`. No copy is made.

**Alternative considered**: copy cache file to tmpdir so the `finally` cleanup works unchanged. Rejected — copying a large audio file wastes I/O; it's cleaner to simply not delete the cache path.

### `finally` block: skip delete for Bilibili handler
The Bilibili handler's `finally` block is restructured to not delete `audioPath` (the cache file). The upload handler's `finally` cleanup is unchanged.

### TTL: 90 days, lazy check on `mtime`
On each cache lookup, `fs.statSync(cachePath).mtimeMs` is compared against `Date.now() - 90 * 24 * 60 * 60 * 1000`. If stale, treat as miss and overwrite. No background job needed.

**Alternative considered**: no TTL. Rejected — Bilibili occasionally re-encodes videos; 90 days balances freshness vs. re-download frequency.

### Named Docker volume `bilibili-audio-cache` → `/data/bilibili-audio`
A named volume survives `docker compose down` / `up` cycles and is managed by Docker. The mount point `/data/bilibili-audio` is fixed and does not require user configuration.

**Alternative considered**: bind mount to a host path. Rejected — named volumes are more portable and don't require the user to pre-create a host directory.

## Risks / Trade-offs

- **Concurrent requests for the same bvid**: Two simultaneous cache-miss requests both download to the same path. Last writer wins; both transcriptions proceed normally. Acceptable for this service's expected concurrency. → No mitigation needed.
- **Disk space growth**: No active eviction. A video library with many unique bvids will accumulate files. → User manages volume size; 90-day TTL provides eventual cleanup on re-access.
- **Stale content on re-encode**: Bilibili may re-encode a video within 90 days. → Rare in practice; acceptable tradeoff.

## Open Questions

None — all design decisions resolved during explore mode.
