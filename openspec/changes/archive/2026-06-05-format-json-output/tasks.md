## 1. Button HTML

- [x] 1.1 Add a `<button class="btn btn-ghost" id="format-btn" disabled onclick="formatTranscript()">Format</button>` to the `.output-actions` div in `public/index.html`, placed before the Copy All button.

## 2. JavaScript Handler

- [x] 2.1 Add `formatTranscript()` function in the inline `<script>`: parse textarea content with `JSON.parse`, on success replace textarea value with `JSON.stringify(parsed, null, 2)` and update char-count; on failure call `setStatus('format error: ' + err.message, 'error')` and leave content unchanged.

## 3. Enable / Disable Wiring

- [x] 3.1 In `handleEvent('done', ...)`, enable `#format-btn` (alongside `#copy-btn`) when transcript text is non-empty.
- [x] 3.2 In `startTranscription()`, disable `#format-btn` and clear it at the start of a new run (alongside `#copy-btn`).
