## Why

The current transcription prompt produces structured JSON optimised for machine parsing, but the primary use cases — summarisation, Q&A, interview analysis, and studying — all require human-readable plain text that can be fed directly to downstream LLMs. Filler-word retention is also needed for interview fluency analysis, and there is no speaker labelling, making multi-speaker audio uninterpretable.

## What Changes

- Replace the static JSON-output prompt with a plain-text prompt that produces `[MM:SS] SpeakerName: content` segments
- Retain filler words verbatim (um, uh, 嗯, 啊, 那个, etc.)
- Add `[inaudible]` and `[unclear: word?]` markers for unintelligible audio
- Extract the Bilibili video owner name from the `/x/web-interface/view` API response and inject it as the primary speaker label
- Remove the `generateContent()` JSON parse step — response is passed through as plain text
- **BREAKING**: API response body changes from a JSON array to a plain-text string

## Capabilities

### New Capabilities
- `human-readable-transcript`: Transcription output is plain text with per-turn timestamps and speaker labels, suitable for human reading and LLM input
- `bilibili-speaker-label`: Bilibili video owner name is extracted from metadata and injected into the transcription prompt as the primary speaker label

### Modified Capabilities
- `format-json-output`: The frontend Format button currently pretty-prints JSON transcript content. Since output is no longer JSON, this capability's requirements change — the Format button should be removed or repurposed.

## Impact

- `src/services/gemini.ts`: prompt replaced, JSON parsing removed, `transcribeAudio()` signature updated
- `src/services/bilibili.ts`: `getCid()` updated to also return `owner.name`
- `src/index.ts`: `ownerName` threaded from Bilibili service to transcription call
- Frontend (if present): Format button behaviour changes due to non-JSON output
