## Why

Users frequently share Bilibili videos via `b23.tv` short links (e.g. `https://b23.tv/rDoCYxq`), but the service rejects them because `extractBvid` only matches `/video/BV…` URL patterns. Short URLs must be resolved via an HTTP redirect before the BVID can be extracted.

## What Changes

- Add a `resolveShortUrl` helper to `src/services/bilibili.ts` that follows `b23.tv` redirects to the canonical `bilibili.com` URL.
- Call `resolveShortUrl` before `extractBvid` inside `downloadBilibiliAudio` so all callers get the fix transparently.
- No changes to the API contract, cache logic, or frontend.

## Capabilities

### New Capabilities
- `b23-url-resolution`: Resolve `b23.tv` short URLs to full Bilibili URLs via HTTP redirect before BVID extraction.

### Modified Capabilities
<!-- none -->

## Impact

- **Code**: `src/services/bilibili.ts` only — `extractBvid` is unchanged, resolution is a pre-step.
- **Dependencies**: No new packages; uses `axios` (already present) for the redirect follow.
- **API**: Transparent — callers pass a URL string; the service now silently handles both URL forms.
- **Tests**: New unit tests for `resolveShortUrl` and updated integration test with a `b23.tv` URL.
