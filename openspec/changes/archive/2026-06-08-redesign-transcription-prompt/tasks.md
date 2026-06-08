## 1. Bilibili Service — rename and extend to return metadata

- [x] 1.1 Rename `getCid()` to `getVideoMetadata()` in `src/services/bilibili.ts` and update all call sites
- [x] 1.2 Expand the API response type to include `title: string`, `desc: string`, `tname: string`, `duration: number`, `dynamic: string`, and `owner: { name: string }`
- [x] 1.3 Update return type to `Promise<{ cid: number; ownerName: string; title: string; desc: string; tname: string; duration: number; dynamic: string }>`
- [x] 1.4 Return `{ cid, ownerName: owner.name, title, desc, tname, duration, dynamic }` from the API response

## 2. Gemini Service — new prompt and plain-text output

- [x] 2.1 Replace the `TRANSCRIPTION_PROMPT` constant with a `buildPrompt(meta: { ownerName: string; title: string; desc: string }): string` function in `src/services/gemini.ts`
- [x] 2.2 Write the new prompt: prepend a "Video context" block (title, channel, description) then the transcription instructions (filler words, `[inaudible]`, speaker label, `[MM:SS]` timestamps)
- [x] 2.3 Update `transcribeAudio()` signature to accept `meta: { ownerName: string; title: string; desc: string; tname: string; duration: number; dynamic: string }` (default `ownerName` to `"Speaker A"` when falsy)
- [x] 2.4 Replace the `TRANSCRIPTION_PROMPT` reference in the `generateContent()` call with `buildPrompt(meta)`
- [x] 2.5 Remove the `JSON.parse(raw)` step and return `raw` (plain string) directly

## 3. Index — thread metadata

- [x] 3.1 Update the `getVideoMetadata()` call in `src/index.ts` to destructure `{ cid, ownerName, title, desc, tname, duration, dynamic }`
- [x] 3.2 Pass `{ ownerName, title, desc, tname, duration, dynamic }` to `transcribeAudio()`

## 4. Frontend — disable Format button

- [x] 4.1 Comment out the `onclick="formatTranscript()"` attribute on the Format button in `public/index.html` and set it as permanently disabled
- [x] 4.2 Comment out the `formatTranscript()` function body
- [x] 4.3 Comment out the `format-btn` enable call in the SSE handler (the disable call on reset can stay)

## 5. Verification

- [x] 5.1 Run `docker compose up --build` and confirm clean build
- [x] 5.2 Submit a Bilibili URL and confirm the response is plain text in `[MM:SS] <owner_name>: content` format
- [x] 5.3 Confirm filler words appear in output for a video that contains them
- [x] 5.4 Confirm Format button is disabled in the UI
