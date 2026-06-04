# Web UI — Context

## 2026-06-04 — Initial design

**Trigger**: Windows users cannot reuse the Mac shell scripts (`curl` / `.sh`); a browser UI removes OS friction entirely.

**Decisions**:

- **Single static HTML file** — no build pipeline, no new deps. Served from `public/` by the existing Express server via `express.static`. Rationale: simplicity; any change to the UI is a single-file edit.
- **Vanilla JS, no framework** — page has three interactive elements (tab switcher, drop zone, SSE display). A framework adds compile/bundle overhead with no benefit at this scale.
- **`fetch()` + ReadableStream for SSE** — `EventSource` is GET-only; our endpoints are POST. Manual SSE parsing splits on `\n\n` and extracts `event:` / `data:` fields. Simple and well-supported in modern browsers.
- **Google Drive input removed** — the feature was in the original backlog but never implemented and is covered by file upload. Explicitly excluded from UI scope per user decision.
- **Model selector included** — API already supports `?model=` query param. Adds minimal UI complexity and is useful for quality/speed trade-off comparisons.
- **Client-side segment join** — `done` SSE payload is still `Segment[]`; the UI joins `.content` fields with `\n`. No backend change required. `raw-transcript-passthrough` is a separate backlog item.
- **Dark/light mode** — `prefers-color-scheme` CSS media query; matches the existing SVG system diagram approach in the repo.
