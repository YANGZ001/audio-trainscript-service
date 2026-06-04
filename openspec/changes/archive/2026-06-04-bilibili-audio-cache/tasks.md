## 1. Docker Infrastructure

- [x] 1.1 Add named volume `bilibili-audio-cache` to `docker-compose.yml` and mount it at `/data/bilibili-audio` on the app service

## 2. Cache Logic in Bilibili Handler

- [x] 2.1 Add a `BILIBILI_AUDIO_CACHE_DIR` constant (default `/data/bilibili-audio`) and a helper that resolves the cache path for a given `bvid`: `${CACHE_DIR}/${bvid}.m4a`
- [x] 2.2 Add a cache-hit check in the `/api/transcribe` handler: if the cache file exists and `mtime` is less than 90 days old, set `audioPath` to the cache path and skip the download (no `downloading` events)
- [x] 2.3 On cache miss, set `audioPath` to the cache path and call `downloadBilibiliAudio(url, audioPath, ...)` — cache dir must be created if it doesn't exist (`fs.mkdirSync(..., { recursive: true })`)
- [x] 2.4 Pass `audioPath` to `transcribeAudio` in place of the old `tempFile`
- [x] 2.5 Remove the `fs.unlinkSync(tempFile)` call from the Bilibili handler's `finally` block (cache file must not be deleted)

## 3. Verification

- [x] 3.1 Run `docker compose up --build` and confirm the service starts with the new volume
- [x] 3.2 Run `test/bilibili/run.sh` for a known video — confirm first request downloads and caches the file at `/data/bilibili-audio/<bvid>.m4a`
- [x] 3.3 Run `test/bilibili/run.sh` again for the same video — confirm no `downloading` events are emitted and response is faster
- [x] 3.4 Confirm `/api/upload-transcribe` still works and its temp file is deleted after use
