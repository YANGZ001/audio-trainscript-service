## Context

The service transcribes audio from URLs using Gemini. It already supports Bilibili (video) and Snipd (English podcast). Xiaoyuzhou (小宇宙) is the dominant Chinese podcast platform and the natural next source.

The Xiaoyuzhou episode page is a Next.js SSG app. Every public episode page embeds a `<script id="__NEXT_DATA__">` tag containing full episode JSON — title, podcast title, description, duration, and a direct CDN audio URL (`media.xyzcdn.net`). The audio CDN is public with no authentication. No API token is required.

## Goals / Non-Goals

**Goals:**
- Accept `xiaoyuzhoufm.com/episode/<id>` URLs in `POST /api/transcribe`
- Fetch episode metadata + audio URL by parsing `__NEXT_DATA__` from the public episode page
- Download and cache the M4A for 90 days, consistent with other sources
- Pass metadata to Gemini for context-aware transcription

**Non-Goals:**
- Authentication or token management (not needed — all data is public)
- Paid/private episode support (`isPrivateMedia: true` episodes will fail gracefully)
- Batch episode listing or search

## Decisions

### D1: Parse `__NEXT_DATA__` from the episode page HTML
The episode page embeds `props.pageProps.episode` as JSON in a `<script id="__NEXT_DATA__">` tag. This contains the direct CDN audio URL at `episode.enclosure.url`, plus all metadata fields. No API call or authentication is needed. Extraction uses a regex on the raw HTML — no HTML parser dependency required.

**Alternatives considered:** Calling `api.xiaoyuzhoufm.com` with a reverse-engineered access token — rejected because the public page already provides everything needed and avoids credential management entirely.

### D2: Cache file extension is `.m4a`
The audio is served as `audio/mp4` (M4A container). Using `.m4a` as the cache extension is accurate and consistent with the existing Bilibili cache (which also stores `.m4a`).

### D3: Identical handler branch structure to Snipd
`index.ts` gains an `else if (source === 'xiaoyuzhou')` block that mirrors the Snipd block. No shared abstraction — three similar blocks is preferable over a premature generic handler.

### D4: `fetchXiaoyuzhouEpisodeData` returns `{ audioUrl, meta }` — same contract as Snipd
The service function signature matches `fetchSnipdEpisodeData` exactly, making the handler branch a near-copy.

## Risks / Trade-offs

- **`__NEXT_DATA__` structure may change** → Xiaoyuzhou controls the page structure; if they change the JSON shape, the extractor breaks. Mitigation: the extractor has clear error messages; `audioUrl` and `eid` are validated before download.
- **Private/paid episodes** → `isPrivateMedia: true` episodes will have no accessible CDN URL. Mitigation: validate `audioUrl` is present and throw a descriptive error.
- **Page fetch may be rate-limited** → Unlikely for a service making one request per unique episode, and mitigated by 90-day caching (subsequent requests use the cached file).
