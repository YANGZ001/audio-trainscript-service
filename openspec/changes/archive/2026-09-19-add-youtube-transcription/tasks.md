## 1. YouTube service

- [x] 1.1 Create `src/services/youtube.ts` with `extractYoutubeVideoId`, `canonicalYoutubeUrl`, and best-effort `fetchYoutubeMeta` (oEmbed)

## 2. Gemini

- [x] 2.1 Extract shared generateContent call into a helper and add `transcribeYoutube(videoUrl, onTranscribing, model, tag, meta)` in `src/services/gemini.ts`

## 3. Pipeline & types

- [x] 3.1 Add `'youtube'` to `SourceType`, `detectSource` regex and error message
- [x] 3.2 Add YouTube branch in `transcribeFromUrl` (meta → onTitle → transcribing → transcribeYoutube)
- [x] 3.3 Add `'youtube'` to source_type unions in `src/db.ts` and `src/index.ts`

## 4. UI & docs

- [x] 4.1 Update URL hints in `public/index.html` and supported-sources text in `README.md`

## 5. Verification

- [x] 5.1 `docker compose up --build -d`; enqueue https://www.youtube.com/watch?v=cBLbDn5RJlw at localhost:3001 and confirm job completes with `[MM:SS] Speaker:` transcript, oEmbed title, and history row `source_type=youtube`
- [x] 5.2 Confirm an unsupported URL is still rejected with the updated message
