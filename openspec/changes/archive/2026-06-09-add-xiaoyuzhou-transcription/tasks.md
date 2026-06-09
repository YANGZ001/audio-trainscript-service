## 1. Service Module

- [x] 1.1 Create `src/services/xiaoyuzhou.ts` with `extractXiaoyuzhouEpisodeId(url)` — regex `/episode\/([0-9a-f]{24})/`, throws if no match
- [x] 1.2 Implement `fetchXiaoyuzhouEpisodeData(episodeId)` — GET `https://www.xiaoyuzhoufm.com/episode/<id>`, extract `<script id="__NEXT_DATA__">` via regex, parse JSON, return `{ audioUrl: episode.enclosure.url, meta: { title, ownerName: episode.podcast.title, desc: episode.description, duration: episode.duration } }`; throw if `__NEXT_DATA__` missing or `audioUrl` empty
- [x] 1.3 Implement `downloadXiaoyuzhouAudio(audioUrl, destPath, onProgress)` — streaming download, 500 MB limit, cleanup on error (mirror `downloadSnipdAudio` exactly)

## 2. Router Integration

- [x] 2.1 Add `import` for the three new functions from `./services/xiaoyuzhou` in `src/index.ts`
- [x] 2.2 Add `XIAOYUZHOU_AUDIO_CACHE_DIR = '/data/xiaoyuzhou-audio'` constant in `src/index.ts`
- [x] 2.3 Extend `detectSource()` return type to include `'xiaoyuzhou'` and add regex `/xiaoyuzhoufm\.com\/episode\//i`; update error message to include Xiaoyuzhou
- [x] 2.4 Update `source` variable type annotation to `'bilibili' | 'snipd' | 'xiaoyuzhou'`
- [x] 2.5 Add `else if (source === 'xiaoyuzhou')` handler branch — extract ID, cache path `.m4a`, same cache-hit/miss/meta pattern as Snipd branch

## 3. Infrastructure

- [x] 3.1 Add `- xiaoyuzhou-audio-cache:/data/xiaoyuzhou-audio` to service `volumes:` in `docker-compose.yml`
- [x] 3.2 Add `xiaoyuzhou-audio-cache:` to top-level `volumes:` in `docker-compose.yml`

## 4. Test Script

- [x] 4.1 Create `test/xiaoyuzhou/run.sh` — POST to `/api/transcribe` with `https://www.xiaoyuzhoufm.com/episode/69d7b5e4e2c8be3155ccc32b`, parse SSE events, print transcript (mirror `test/snipd/run.sh`)

## 5. Verification

- [x] 5.1 Build with `docker compose up --build` and confirm no TypeScript errors
- [x] 5.2 Run `bash test/xiaoyuzhou/run.sh` and confirm `done` event with non-empty transcript in Chinese
- [x] 5.3 Run the same URL a second time and confirm no `downloading` events (cache hit)
