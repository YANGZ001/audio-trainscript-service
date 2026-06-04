# Tasks: Raw Transcript Passthrough

## Phase 1 — Core Change

- [x] Change `transcribeAudio` return type from `Promise<Segment[]>` to `Promise<string>`
- [x] Remove the `Segment` type from `gemini.ts`
- [x] Remove Repairs 1–5 (all regex passes and the `quotFixed` / `timeFixed` / `repaired` / `boxFixed` / `cleaned` chain)
- [x] Remove `JSON.parse`, fallback array-extraction, and malformed-segment filtering
- [x] Return `raw` (the trimmed Gemini response string) directly
- [x] Update `index.ts` `/api/transcribe`: change `done` payload from `transcript` array to `{ text: transcript }`; update log to show char count
- [x] Update `index.ts` `/api/upload-transcribe`: same `done` payload and log change
- [x] Update `public/index.html` `handleEvent`: replace segment-array join with `payload.text` read; remove `formatTime` usage and segment count display from the `done` path
- [x] Update `USAGE.md` `done` payload example and field description to reflect `{ text: string }`

## Phase 2 — Cleanup

- [x] Remove the `[WARN] parse error` log path (now unreachable)
- [x] Remove the `[DEBUG] raw response (first 500 chars)` log or repurpose it as the full passthrough confirmation
- [x] Verify no other file imports `Segment` type; remove any orphaned imports

## Phase 3 — Verification

- [x] Build with `docker compose up --build`
- [x] Run a Bilibili transcription request; confirm `done` event carries `{ text: "..." }` with Gemini's raw output
- [x] Run an upload-transcribe request; confirm same shape
- [x] Confirm no `[ERROR]` JSON parse errors in logs
- [x] Confirm status events (`downloading`, `uploading`, `transcribing`) still fire correctly

## Acceptance Criteria

- Sending a valid Bilibili URL returns a `done` SSE event with `{ text: <string> }` where the string is non-empty
- No JSON parse errors appear in service logs for any Gemini response, regardless of format
- The `Segment` type no longer exists in the codebase
- The repair pipeline (Repairs 1–5) no longer exists in the codebase
- `docker compose up --build` completes without TypeScript errors
- Opening the web UI and submitting a Bilibili URL shows non-empty transcript text (not a blank textarea)
