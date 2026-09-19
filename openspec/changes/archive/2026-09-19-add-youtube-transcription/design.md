## Context

Every current source follows the same path: get metadata, download audio into `/data/<source>-audio`, upload it to the Gemini Files API, and then call `generateContent`. YouTube downloads (yt-dlp) are fragile because of anti-bot checks, but the Gemini API accepts a public YouTube URL directly as `fileData.fileUri`.

## Goals / Non-Goals

**Goals:** transcribe public YouTube videos using the same prompt and output format; persist them to history; keep the change small.

**Non-Goals:** private or unlisted videos, local audio caching for YouTube, YouTube's own captions, cookie/PO-token handling.

## Decisions

- **Gemini URL input rather than yt-dlp or captions.** It needs no new dependency and isn't affected by YouTube's anti-bot measures. The verbatim prompt stays, including filler words and speakers. Alternatives: yt-dlp (fragile, needs heavier Docker image) and YouTube captions (no speaker labels, filler words stripped, which breaks the fluency-analysis use case).
- **Separate YouTube branch in `transcribeFromUrl`.** YouTube has no `audioPath`, so it doesn't fit the `Prepared` shape. It gets its own branch that calls a new `transcribeYoutube()` in `gemini.ts`. The Gemini request-building code is shared with `transcribeAudio` through a small helper, so the prompt stays in one place.
- **oEmbed for metadata.** It's public and needs no key. It returns the title and channel, which is enough for the prompt context. Failures don't block transcription.
- **Canonical URL.** Always send `https://www.youtube.com/watch?v=<id>` so that tracking params and timestamps don't affect Gemini.

## Risks / Trade-offs

- [The configured model may not support YouTube URLs] → Check with the test URL during implementation and report back if it's rejected. Don't switch models silently.
- [Long videos cost a lot of tokens, and Gemini has daily limits on YouTube input] → Accepted; Gemini's error message is passed through when a job fails.
- [Every retry re-processes the video because there's no cache] → Accepted; history already stores the transcript.
