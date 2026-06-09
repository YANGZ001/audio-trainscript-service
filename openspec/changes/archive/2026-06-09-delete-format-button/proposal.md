## Why

The Format button is dead code: it was disabled when the transcript output switched from JSON to plain text, and its implementation (`formatTranscript`) was commented out at the same time. It adds visual noise to the output actions row and leaves stale references scattered across `index.html`.

## What Changes

- Remove the `<button id="format-btn">` element and its associated HTML comment from the output actions row
- Remove the `document.getElementById('format-btn').disabled = true` call in `startTranscription()`
- Remove the commented-out `// document.getElementById('format-btn').disabled = false` line in the `done` event handler
- Remove the commented-out `formatTranscript()` function block
- **BREAKING**: Delete `openspec/specs/format-json-output/spec.md` — the capability no longer exists

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `format-json-output`: Capability is being removed entirely — the spec should be deleted, not updated

## Impact

- `public/index.html`: all four dead-code sites removed
- `openspec/specs/format-json-output/spec.md`: deleted (capability gone)
- No backend changes, no API changes, no new dependencies
