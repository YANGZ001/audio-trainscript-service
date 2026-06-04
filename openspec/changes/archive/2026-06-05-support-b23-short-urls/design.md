## Context

`src/services/bilibili.ts` exposes `extractBvid(url)` which matches `/video/BV…` in the URL string. `b23.tv` short links (e.g. `https://b23.tv/rDoCYxq`) redirect to the canonical Bilibili URL via a single HTTP 302. The service never follows that redirect, so `extractBvid` throws, and the request fails with a 400-level error.

The bilibili-copilot-web project already solves this with a `resolveShortUrl` helper (strategy: manual redirect → read `Location` header). The same approach applies here.

## Goals / Non-Goals

**Goals:**
- Accept `b23.tv` short URLs in `POST /api/transcribe` without any API change.
- Resolve the redirect with a single HTTP call before BVID extraction.

**Non-Goals:**
- Supporting other URL shorteners or aliased domains.
- Caching resolved URLs.
- Changing the frontend or API contract.

## Decisions

**Where to add resolution**: In `src/index.ts` at the route handler, before any bilibili service call. The canonical long URL becomes the value used for the rest of the pipeline (cache path lookup, download, BVID extraction).
- Alternative: resolve inside `downloadBilibiliAudio`. Rejected — the canonical URL would not be used for the cache path lookup (`audioCachePath`) in `src/index.ts`, which runs before `downloadBilibiliAudio` is called. Resolution must happen first so the whole pipeline sees the same URL.

**HTTP client**: Use `axios` (already a dependency) with `maxRedirects: 0` and `validateStatus: null` to capture the `Location` header from the first redirect response.
- Alternative: Node `https.request`. More verbose for no benefit; axios is already in the bundle.

**Timeout**: 5 s for the redirect resolution call — short links should resolve in < 1 s; anything longer indicates a network issue.

**Fallback**: If the redirect call fails or returns a non-3xx, pass the original URL through unchanged and let `extractBvid` throw with its existing error message.

## Risks / Trade-offs

- **Bilibili changes b23.tv resolution** → The redirect endpoint is a stable public URL shortener; low risk. The fallback (pass original URL through) prevents silent failures.
- **Extra network round-trip** → ~50–200 ms for `b23.tv` resolution; negligible relative to the subsequent audio download. Only incurred for `b23.tv` URLs.
- **Node 18 fetch vs axios**: The service already uses axios for all HTTP; keeping it consistent avoids mixing two HTTP clients.
