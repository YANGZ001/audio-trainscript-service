## Why

Users want to transcribe YouTube videos (e.g. interview recordings), but `detectSource()` only accepts Bilibili, Snipd and Xiaoyuzhou URLs and rejects YouTube links as unsupported. Gemini can read a public YouTube URL natively, so we can add support without downloading anything or adding a dependency.

## What Changes

- Accept YouTube URLs (`youtube.com/watch?v=`, `youtu.be/<id>`, `youtube.com/shorts/<id>`, `youtube.com/live/<id>`) as a new `youtube` source.
- Extract the 11-character video ID and send the canonical `https://www.youtube.com/watch?v=<id>` URL straight to Gemini as `fileData.fileUri`, with no local download, audio cache or Gemini file upload.
- Get title and channel name on a best-effort basis from YouTube's public oEmbed endpoint and pass them into the existing transcription prompt.
- Store completed YouTube transcriptions in history as `source_type='youtube'`, `content_id=<video id>`.
- Update the unsupported-URL error message, README and UI hints to list YouTube.

## Capabilities

### New Capabilities
- `youtube-video-transcription`: Detects YouTube URLs, extracts the video ID, fetches oEmbed metadata, transcribes by passing the URL to Gemini directly, and persists the result to history.

### Modified Capabilities
<!-- none: existing sources are unaffected; history persistence for youtube is specified in the new capability -->

## Impact

- Code: `src/services/youtube.ts` (new), `src/services/gemini.ts`, `src/services/transcribePipeline.ts`, `src/db.ts` and `src/index.ts` (type unions), `public/index.html`, `README.md`.
- No DB migration (`source_type` is a plain TEXT column), no new npm/Docker dependencies.
- External: Gemini YouTube URL input (public videos only, subject to Gemini quotas) and `https://www.youtube.com/oembed`.
