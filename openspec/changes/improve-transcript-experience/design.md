## Context

The app is a single HTML page with an Express/SQLite backend. History metadata is already fetched without transcript bodies. Jobs currently exclude completed rows and the UI guesses completion when a row disappears. The user approved the first four improvements from the review.

## Goals / Non-Goals

**Goals:** Read/export transcripts, search title/author and filter source, show reliable completion links, make operation errors visible.

**Non-Goals:** Batch submission, new audio formats, upload persistence, concurrency changes, pagination, full visual redesign.

## Decisions

- Keep the vanilla frontend. Use a native dialog reader with plain-text rendering, Escape/close support, loading and error states, and copy/TXT/Markdown actions. Copying is consolidated in the reader; the history list retains the title entry point and delete action. This avoids extra dependencies and unsafe HTML rendering.
- Filter loaded metadata locally; current history has 31 rows. Preserve filters during refresh. Show count, author and a distinct no-matches state.
- Add `GET /api/jobs?includeDone=true` to include recently retained completed jobs. Default requests stay unchanged. Track submitted/observed active jobs and only announce their explicit done state. On return to the page refresh history; if a completion row has expired, refresh history without falsely claiming completion.
- Cache transcript bodies keyed by id and invalidate on changed history metadata, deletion or completion. Guard reader loads against closing or switching to another result.
- Check every mutation response. Retry submission failure preserves the failed job; successful submission followed by failed dismissal explicitly reports partial success and disables repeat submission until cleanup succeeds.
- Use separate history, queue and reader status regions so a polling success does not erase a mutation error. Avoid overlapping polls and rebuild queue rows only when data changes.

## Risks / Trade-offs

- [Done rows expire after 60 seconds] → Completion notifications are best-effort for actively tracked jobs; page visibility refresh keeps history current without misreporting cancellation.
- [Large future history] → Local search matches the existing all-metadata API; pagination can be a subsequent change.
- [Browser clipboard permission failure] → Keep the current HTTP fallback and show a visible error.

## Migration Plan

No database migration. Build/start with Docker Compose on port 3001 and verify existing history remains. Roll back by restoring the changed frontend/backend files and rebuilding; persisted data is unaffected.
