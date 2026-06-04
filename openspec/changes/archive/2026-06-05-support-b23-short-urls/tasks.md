## 1. Implementation

- [x] 1.1 Add `resolveShortUrl(url: string): Promise<string>` to `src/services/bilibili.ts` — uses axios with `maxRedirects: 0`, reads the `Location` header on a 3xx response, returns original URL on failure or non-3xx
- [x] 1.2 Call `resolveShortUrl` at the top of the `/api/transcribe` route handler in `src/index.ts`, replacing `url` with the resolved canonical URL before `extractBvid`, `audioCachePath`, and `downloadBilibiliAudio` are called

## 2. Tests

- [x] 2.1 Add `test/bilibili/run.sh` test case that submits a `b23.tv` URL (`https://b23.tv/rDoCYxq`) and verifies the SSE stream returns a `done` event with non-empty `text`
- [x] 2.2 Manually verify: submit `https://b23.tv/rDoCYxq` via the web UI and confirm a transcript is returned

## 3. Acceptance

- [x] 3.1 `POST /api/transcribe` with `{"type":"bilibili","url":"https://b23.tv/rDoCYxq"}` returns a `done` SSE event with non-empty transcript
- [x] 3.2 Existing full `bilibili.com/video/BV…` URLs continue to work without regression
- [x] 3.3 `docker compose up --build` succeeds with no TypeScript errors
