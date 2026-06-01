# Review Fixes — Tasks

## Phase 1: Bug Fixes (hang / data-loss)

- [x] **bilibili.ts** — pass `sizeError` to `writer.destroy(sizeError)` so the Promise rejects instead of hanging (#1)
- [x] **gemini.ts** — add 100-iteration cap to the PROCESSING poll loop; throw on timeout (#2)
- [x] **gemini.ts** — skip orphan cleanup for files with no `createTime` instead of falling back to epoch 0 (#3)

## Phase 2: Correctness Fixes

- [x] **bilibili.ts** — throw early when `BILIBILI_SESSION_TOKEN` is absent or empty (#4)
- [x] **index.ts** — replace `Date.now()` temp file suffix with `crypto.randomUUID()` (#5)
- [x] **gemini.ts** — filter malformed segments from the return value (#6)
- [x] **gemini.ts** — guard `fileInfo.uri` before passing to `generateContent`; throw if falsy (#12)

## Phase 3: Infrastructure & Tooling

- [x] **Dockerfile** — change `EXPOSE 3000` to `EXPOSE 3001` (#8)
- [x] **Dockerfile** — add non-root `app` user; run CMD as that user (#9)
- [x] **test.sh** — use `jq` to construct the JSON payload instead of string interpolation (#11)

---

## Acceptance Criteria

- `docker compose up --build` succeeds with no errors.
- Sending a request while the 200 MB limit is exceeded causes the SSE stream to emit an `error` event and close (not hang).
- Starting the service with `BILIBILI_SESSION_TOKEN` unset causes a startup or request-time error with the message `BILIBILI_SESSION_TOKEN is not set`.
- A file stuck in PROCESSING state does not loop the service indefinitely; after ~5 minutes an `error` SSE event is emitted.
- The orphan cleanup at startup does not delete Gemini files that lack a `createTime` field.
- Concurrent requests produce distinct temp file paths with no collision.
- `docker inspect` on the running container shows the process owner is `app`, not `root`.
- `./test.sh` with a URL containing special characters produces a valid JSON request body.
