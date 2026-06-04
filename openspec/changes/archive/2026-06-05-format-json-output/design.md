## Context

The app is a single-file frontend (`public/index.html`) with an inline `<script>`. The transcript output area is a `<textarea id="transcript">` that receives raw LLM text via SSE. When the LLM is asked for structured output it returns minified JSON, which is unreadable in the textarea.

## Goals / Non-Goals

**Goals:**
- Add a Format button that pretty-prints textarea content as JSON in-place.
- Show a status-bar error on parse failure; leave content unchanged.
- Keep the button disabled when the textarea is empty (consistent with Copy All).

**Non-Goals:**
- No backend changes.
- No YAML, XML, or other format support.
- No dedicated error UI beyond the existing status bar.

## Decisions

**Reuse the existing status bar for errors** — the `setStatus(text, 'error')` helper already exists and renders inline. Adding a separate error element would be redundant for a transient message.

**Disable button when textarea is empty** — mirrors the Copy All button's guard; avoids a pointless click with no content.

**In-place replacement** — overwrites the textarea value directly, matching how `handleEvent('done')` populates it. No new state variable needed.

## Risks / Trade-offs

- [Large JSON] `JSON.stringify(parsed, null, 2)` on a very large payload could momentarily freeze the UI thread. → Acceptable for this use case; transcript payloads are small.
- [Already formatted] Clicking Format a second time on already-formatted JSON is idempotent (re-formats fine). → No action needed.

## Migration Plan

No migration needed. Single-file, client-side change. Deploy by rebuilding the Docker image.
