## Why

The LLM (Gemini) returns its transcript response as raw JSON, which lands unformatted in the textarea — hard to read at a glance. A one-click format button lets users instantly pretty-print the output without leaving the page.

## What Changes

- Add a **Format** button to the output actions row (beside the existing Copy All button).
- Clicking Format attempts to parse the textarea content as JSON and replaces it with `JSON.stringify(parsed, null, 2)`.
- If parsing fails, show the error message in the status bar and leave the content unchanged.
- The button is disabled while the textarea is empty (same condition as Copy All).

## Capabilities

### New Capabilities
- `format-json-output`: A client-side button that pretty-prints JSON content in the transcript textarea, with inline error feedback on parse failure.

### Modified Capabilities
<!-- none -->

## Impact

- Only `public/index.html` is modified (button HTML + one JS function + enable/disable wiring).
- No backend changes. No new files.
