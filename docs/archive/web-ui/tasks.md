# Web UI — Tasks

## Phase 1: Infrastructure

- [x] Create `docs/web-ui/` feature docs (proposal, design, tasks, context, tests)
- [x] Add `public/index.html` — full single-file UI
- [x] Update `src/index.ts` — add `express.static('public')` middleware
- [x] Update `Dockerfile` — add `COPY public/ ./public/` in final stage

## Phase 2: Verification

- [x] `docker compose up --build` completes without TypeScript errors
- [x] `GET /` returns the HTML page (HTTP 200, text/html)
- [x] Bilibili URL golden path: tested by user — progress events show, transcript text with timestamps appears
- [x] Error case: empty URL → client-side validation fires, no request sent
- [x] Error case: invalid Bilibili URL → server SSE error event shown in red (verified via curl)
- [ ] File upload golden path: manual browser test pending
- [ ] Model selector: manual browser test pending
- [ ] Drag-and-drop: manual browser test pending

## Acceptance Criteria

- Navigating to `http://<host>:3001` in a browser shows the UI without any 404 or console errors
- A valid Bilibili URL produces a readable plain-text transcript with correct progress indicators
- A valid `.m4a` upload produces a plain-text transcript
- Copy All copies the full transcript to clipboard
- All error states (empty input, network failure, server error) surface a visible, human-readable message
