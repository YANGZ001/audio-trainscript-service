## Context

The service transcribes audio by: (1) downloading from a source, (2) uploading to Gemini Files API, (3) streaming the transcript back via SSE. Today the only source is Bilibili. Snipd is a podcast listening app whose share pages (`share.snipd.com/episode/<uuid>`) are Next.js apps that embed episode data — including the underlying podcast MP3 URL — in a `<script id="__NEXT_DATA__">` JSON blob. The podcast episode audio is publicly accessible (no auth) once the URL is extracted.

Constraint: Snipd's CDN/share domain is behind Cloudflare bot management, which may return `403 + cf-mitigated: challenge` to data-center IP ranges. The same pages work in browsers because Cloudflare issues a JS-based challenge that browsers solve silently.

## Goals / Non-Goals

**Goals:**
- Accept a Snipd episode URL in `POST /api/transcribe` (auto-detected from URL, no `type` field) and return a transcript over SSE.
- Extract the podcast MP3 URL and episode metadata from the Snipd share page.
- Cache downloaded MP3s at `/data/snipd-audio/<uuid>.mp3` with the same 90-day TTL used for Bilibili.
- Generalize the cache concept so adding future sources is a one-liner in the router.
- Surface a clear error when Cloudflare blocks the page fetch.

**Non-Goals:**
- Snipd snip links (`/snip/<id>`) — not in scope.
- Other podcast platforms (Apple Podcasts, Spotify, etc.).
- Bypassing Cloudflare via headless browser (Playwright/Puppeteer) — no new heavy dependencies.
- Transcoding audio formats — Gemini accepts MP3 natively.

## Decisions

### 1. Source module pattern: mirror `bilibili.ts`

Create `src/services/snipd.ts` exporting:
- `extractSnipdEpisodeId(url)` — regex `/episode\/([0-9a-f-]{36})/i`, throws on mismatch
- `fetchSnipdEpisodePage(url)` — GET with browser-like headers, returns HTML string
- `parseSnipdEpisodeData(html)` — parse `__NEXT_DATA__` JSON, return `{ audioUrl, meta: TranscriptMeta }`
- `downloadSnipdAudio(audioUrl, destPath, onProgress)` — stream to disk, 500 MB cap

The router (`src/index.ts`) calls these in the same sequence it calls Bilibili functions. No new abstractions.

**Alternative considered:** A generic `AudioSource` interface with a registry. Rejected — two sources don't justify the abstraction. A small URL-pattern matching function is cleaner.

### 2. URL-based source routing (replaces `type` field)

The `POST /api/transcribe` request body contains only `{ "url": "..." }`. A `detectSource(url)` helper in `src/index.ts` matches the URL against known patterns and returns the source name or throws HTTP 400:

```
bilibili.com | b23.tv  →  "bilibili"
share.snipd.com/episode/  →  "snipd"
anything else  →  throw 400 "Unsupported URL"
```

**Why remove `type`?** Requiring the client to specify a `type` it can't be wrong about (the URL already uniquely identifies the source) is redundant and fragile. Auto-detection is simpler for callers and removes a class of mismatched-type bugs.

**Backward compatibility:** Existing clients sending `type: "bilibili"` will break. Acceptable — this is an internal tool with a single UI client that will be updated together.

### 3. Snipd page parsing: `__NEXT_DATA__` JSON extraction

Snipd's share site is built with Next.js, which serialises the initial server-side props into `<script id="__NEXT_DATA__" type="application/json">...</script>`. This JSON contains the episode record including `episodeUrl` (the RSS enclosure MP3 URL) and all metadata fields.

Extraction steps:
1. Regex-capture the JSON from the `__NEXT_DATA__` script tag.
2. Navigate `pageProps.episode` (or `pageProps.data.episode`) to find `audioUrl`/`episodeUrl`.
3. Map fields to `TranscriptMeta`: `title`, `podcastTitle` → `ownerName`, `description` → `desc`, `durationInSeconds` → `duration`, `podcastGenre` → `tname`.

**Fallback if structure changes:** throw a descriptive error ("Snipd page structure changed — could not extract audio URL") so the SSE error event is informative.

### 4. Cloudflare 403 handling

Use realistic browser headers on the page fetch:
```
User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ...
Accept: text/html,application/xhtml+xml,...
Accept-Language: en-US,en;q=0.9
```

If the response status is not 200, throw `SnipPageBlockedError` with a human-readable message. The router catches it and emits `{ event: "error", data: { error: "..." } }`. No retry logic — adding retries would risk IP-level blocks.

### 5. Cache generalization

Keep separate per-source directories (`/data/bilibili-audio/`, `/data/snipd-audio/`) so files stay namespaced by source. The cache check/TTL logic in `src/index.ts` is identical for both — same `isCacheHit()` helper, same 90-day constant. No shared abstraction layer needed; two calls to the same helper is fine.

**Why not a single `/data/audio/` with `bilibili-<id>` vs `snipd-<id>` prefixes?** Separate dirs map cleanly to separate Docker volumes, making it easy to wipe one source's cache independently.

### 6. Audio format: MP3

Snipd episodes are podcast MP3 files. Gemini's Files API accepts `audio/mpeg` directly. No conversion step needed. Cache files stored as `<uuid>.mp3`.

## Risks / Trade-offs

- **Cloudflare blocking** → Mitigation: browser-like headers; surface clear error to user; document known limitation. If blocking becomes systematic, the next step is to investigate whether Snipd exposes a public JSON API (network tab inspection in browser).
- **`__NEXT_DATA__` schema changes** → Mitigation: descriptive error message pinpoints the broken field path. A failing test with the sample URL will catch this quickly.
- **Large podcast files** → Mitigation: 500 MB cap in `downloadSnipAudio`, same pattern as Bilibili's 200 MB cap (Bilibili is video-derived audio, so smaller; podcasts can be 2–3 hours).
- **Slow downloads for long episodes** → Mitigation: progress callback keeps SSE connection alive; same timeout patterns as Bilibili.
