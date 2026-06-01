# Review Fixes — Technical Design

## Changes by File

### `src/services/bilibili.ts`

**Fix #1 — Promise hangs on size-limit breach**
`writer.destroy()` (no argument) does not emit `'error'` in Node ≥14; it only emits `'close'`. The `Promise` never settles, hanging the request indefinitely.
Change: `writer.destroy()` → `writer.destroy(sizeError)` so the error handler fires and `reject(sizeError)` is called.

**Fix #4 — Silent empty SESSDATA**
`process.env.BILIBILI_SESSION_TOKEN ?? ''` silently sends an empty cookie and produces a confusing Bilibili API error.
Change: throw `Error('BILIBILI_SESSION_TOKEN is not set')` when the env var is absent or empty.

### `src/services/gemini.ts`

**Fix #2 — Infinite polling loop**
`while (fileInfo.state === 'PROCESSING')` has no exit condition beyond the state changing. A stuck file loops forever.
Change: add a counter cap (100 iterations × 3 s = 5 minutes). Throw `Error('Gemini file processing timed out')` when exceeded.

**Fix #3 — `createTime` fallback to Unix epoch deletes all files**
`new Date((file.createTime as string) ?? 0)` evaluates to 1970-01-01 when `createTime` is absent, making every such file older than the 1-hour cutoff and causing it to be deleted on startup.
Change: `continue` (skip the file) when `file.createTime` is absent or falsy.

**Fix #6 — Malformed segments silently returned**
Segments that fail the shape check are logged but included in the return value, delivering partial garbage to the client.
Change: filter malformed segments out of the returned array (log remains).

**Fix #12 — `fileInfo.uri` used without null guard**
`fileInfo.uri` can be `undefined`; passing it to `generateContent` produces a cryptic downstream error.
Change: throw `Error('Gemini file URI missing after upload')` when `fileInfo.uri` is falsy.

### `src/index.ts`

**Fix #5 — Temp file name collision under concurrency**
`bilibili-${Date.now()}.m4a` collides at millisecond precision under concurrent requests.
Change: use `crypto.randomUUID()` for the temp file name suffix.

### `Dockerfile`

**Fix #8 — `EXPOSE 3000` mismatches docker-compose default of `3001`**
Change: `EXPOSE 3001`.

**Fix #9 — Container runs as root**
Change: add `RUN addgroup -S app && adduser -S app -G app` and `USER app` before `CMD`.

### `test.sh`

**Fix #11 — Unsafe URL interpolation**
`-d "{...\"url\":\"$URL\"}"` breaks if the URL contains quotes or backslashes.
Change: build the JSON payload with `jq -n --arg url "$URL" '{type:"bilibili",url:$url}'`.

## Directory Changes

No new files. Modifications only:
- `src/services/bilibili.ts`
- `src/services/gemini.ts`
- `src/index.ts`
- `Dockerfile`
- `test.sh`
