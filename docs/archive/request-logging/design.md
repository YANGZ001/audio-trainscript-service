# Design: Comprehensive Request Logging

## Log Format

All new log lines use `console.log` with a `[tag]` prefix:

```
[BV16eSQYLEWa] transcribe request received
[BV16eSQYLEWa] bvid extracted
[BV16eSQYLEWa] fetching cid
[BV16eSQYLEWa] cid=12345678
[BV16eSQYLEWa] fetching audio stream url
[BV16eSQYLEWa] audio stream url obtained
[BV16eSQYLEWa] downloading audio
[BV16eSQYLEWa] download complete (12.3 MB, 4s)
[BV16eSQYLEWa] uploading to Gemini
[BV16eSQYLEWa] Gemini file uploaded, state=PROCESSING
[BV16eSQYLEWa] waiting for Gemini processing (attempt 1)
[BV16eSQYLEWa] file ready, generating transcript (model=gemini-3.1-flash-lite)
[BV16eSQYLEWa] transcript received (1024 chars)
[BV16eSQYLEWa] transcription done (42 segments, 28s total)
[BV16eSQYLEWa] Gemini file deleted
```

Error logs retain BVID:
```
[BV16eSQYLEWa] error — <Error message>
```

For `upload-transcribe` (no BVID), use the original filename:
```
[video.m4a] upload-transcribe request received
[video.m4a] uploading to Gemini
...
```

## Tag Strategy

- `tag` is a plain string passed as an optional last parameter to service functions.
- Default fallback inside each function: `tag ?? 'bilibili'` or `tag ?? 'gemini'`.
- BVID is extracted in `index.ts` before calling `downloadBilibiliAudio`, so it is available for both the download and transcription calls.

## API Design

No HTTP API changes. Two internal function signatures gain an optional `tag?` parameter:

```typescript
// bilibili.ts
export async function downloadBilibiliAudio(
  url: string,
  destPath: string,
  onProgress: (progress: number) => void,
  tag?: string,   // ← added
): Promise<void>

// gemini.ts
export async function transcribeAudio(
  filePath: string,
  onTranscribing: () => void,
  model?: string,
  tag?: string,   // ← added
): Promise<Segment[]>
```

`extractBvid` is already exported from `bilibili.ts`; `index.ts` calls it before `downloadBilibiliAudio` to obtain the BVID early.

## Core Flow (Bilibili path)

```
POST /api/transcribe
  │
  ├─ extractBvid(url) → bvid                  LOG: [bvid] transcribe request received
  ├─ downloadBilibiliAudio(url, tmp, cb, bvid)
  │    ├─ extractBvid                          LOG: [bvid] bvid extracted
  │    ├─ getCid                               LOG: [bvid] fetching cid → cid=N
  │    ├─ getAudioStreamUrl                    LOG: [bvid] fetching audio stream → obtained
  │    └─ axios stream download               LOG: [bvid] downloading → complete (X MB, Xs)
  │
  ├─ transcribeAudio(tmp, cb, model, bvid)
  │    ├─ ai.files.upload                      LOG: [bvid] uploading to Gemini → uploaded state=X
  │    ├─ poll loop                            LOG: [bvid] waiting (attempt N) per iteration
  │    ├─ onTranscribing()                     LOG: [bvid] file ready, generating (model=X)
  │    ├─ ai.models.generateContent            LOG: [bvid] transcript received (N chars)
  │    └─ ai.files.delete                      LOG: [bvid] Gemini file deleted
  │
  └─ done                                      LOG: [bvid] transcription done (N segments, Xs total)
```

## Directory Changes

Modified files only — no new files:

| File | Change |
|---|---|
| `src/index.ts` | Extract BVID early; add lifecycle logs; thread tag into service calls |
| `src/services/bilibili.ts` | Add `tag?` param; log each step |
| `src/services/gemini.ts` | Add `tag?` param; log each step |
