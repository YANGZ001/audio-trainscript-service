## Context

The Format button was disabled in a prior change when the transcript output format switched from JSON to plain text. The button (`id="format-btn"`), its onclick handler (`formatTranscript()`), and all references to it remain in `public/index.html` as commented-out or force-disabled dead code.

## Goals / Non-Goals

**Goals:**
- Remove the Format button element and its HTML comment from the output actions row
- Remove all dead `format-btn` DOM references from JavaScript
- Remove the commented-out `formatTranscript()` function
- Delete the `format-json-output` spec since the capability no longer exists

**Non-Goals:**
- No backend changes
- No re-implementation of formatting in any other form
- No styling or layout changes beyond the button's removal

## Decisions

**Delete the spec file outright rather than archiving it as "removed".**
The capability never shipped as active code; it was disabled immediately. Keeping a tombstone spec would imply a lifecycle that never happened.

## Risks / Trade-offs

No risks. All four code sites are either already disabled (button is `disabled` attribute) or commented out; removing them cannot change runtime behavior.
