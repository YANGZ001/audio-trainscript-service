## 1. Remove Format Button from HTML

- [x] 1.1 Delete the HTML comment and `<button id="format-btn">` element from the output actions row in `public/index.html`

## 2. Remove Dead JavaScript References

- [x] 2.1 Delete the `document.getElementById('format-btn').disabled = true` line in `startTranscription()`
- [x] 2.2 Delete the commented-out `// document.getElementById('format-btn').disabled = false` line in the `done` event handler
- [x] 2.3 Delete the commented-out `formatTranscript()` function block (the `/* ... */` comment block)

## 3. Delete Obsolete Spec

- [x] 3.1 Delete `openspec/specs/format-json-output/spec.md` and its parent directory
