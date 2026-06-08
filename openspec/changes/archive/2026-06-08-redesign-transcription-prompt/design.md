## Context

The service transcribes Bilibili audio via the Gemini API. The current prompt instructs Gemini to return a structured JSON array with precise `from`/`to` timestamps. The frontend receives this over SSE and offers a Format button to pretty-print it. The primary consumers of the transcript are humans and downstream LLMs (for summarisation, Q&A, interview analysis), neither of which benefits from raw JSON.

## Goals / Non-Goals

**Goals:**
- Produce human-readable transcript output: `[MM:SS] SpeakerName: content`
- Retain filler words verbatim for interview fluency analysis
- Mark unintelligible segments rather than hallucinating
- Label the primary Bilibili speaker by the video owner's name
- Remove the now-broken Format button from the frontend

**Non-Goals:**
- Streaming the Gemini response token-by-token (SSE delivery is already in place at the HTTP layer)
- Supporting multiple output format modes (JSON vs text toggle)
- Speaker diarisation beyond what Gemini infers from audio

## Decisions

### 1. Replace static `TRANSCRIPTION_PROMPT` with a function

**Decision:** Change `TRANSCRIPTION_PROMPT` from a module-level constant to a `buildPrompt(posterName: string): string` function.

**Rationale:** The poster name is dynamic per request; a function is the minimal change to support injection without introducing a config object or class.

**Alternative considered:** Pass a `context` object to `transcribeAudio()`. Rejected — over-engineered for a single extra field.

---

### 2. Remove JSON parsing from `transcribeAudio()`

**Decision:** Delete the `JSON.parse(raw)` call and return `raw` (plain string) directly.

**Rationale:** The model output is now prose, not JSON. Parsing would throw on every call.

**Alternative considered:** Dual-mode output with a flag. Rejected — no existing callers need JSON; keeping dead code adds maintenance burden.

---

### 3. Rename `getCid()` to `getVideoMetadata()` and pass full metadata as Gemini context

**Decision:** Rename `getCid()` to `getVideoMetadata()`, expand the type to include `title`, `desc`, and `owner: { name: string }`, and inject all of it as a context block prepended to the Gemini prompt.

**Rationale:** The `/x/web-interface/view` response already contains `title`, `desc`, and `owner.name` at no extra cost. Providing video title and description to Gemini gives it domain context, which improves transcription accuracy for technical terminology and speaker identification — better than owner name alone.

**Context block injected into prompt:**
```
Video context:
- Title: <title>
- Channel: <ownerName>
- Category: <tname>
- Duration: <duration>s
- Description: <desc>
- Post: <dynamic>
```

**Alternative considered:** Pass only `ownerName`. Rejected — title, description, category, and post text all add domain context that meaningfully helps the model with terminology and calibrate transcript completeness.

---

### 4. Comment out the Format button rather than delete it

**Decision:** Comment out the `onclick` handler and `formatTranscript()` function in `public/index.html`, and keep the button permanently disabled. Do not delete the code.

**Rationale:** The Format button is only broken because output is no longer JSON. When a structured output mode is added in the future, the button can be re-enabled with minimal effort. Commenting out preserves the intent without leaving broken behaviour.

## Risks / Trade-offs

- **Breaking API response format** → Any external caller parsing the JSON array will break. Mitigation: this is an internal service with no published API contract; document the change in the PR.
- **Gemini filler-word fidelity** → Flash Lite may still clean up some fillers despite the instruction. Mitigation: prompt explicitly names Chinese fillers (嗯, 啊, 那个) to improve compliance.
- **owner.name absent for non-Bilibili sources** → If a non-Bilibili URL is used, `ownerName` will be undefined. Mitigation: default to `"Speaker A"` when `ownerName` is falsy.

## Migration Plan

1. Deploy updated service — response format changes immediately on next request
2. No database migration required
3. Rollback: revert `TRANSCRIPTION_PROMPT` and JSON parse; re-enable Format button
