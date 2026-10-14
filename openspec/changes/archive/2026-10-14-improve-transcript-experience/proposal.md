## Why

Users cannot read URL transcripts directly, find older results efficiently, or reliably tell whether queue actions succeeded. Improve the daily submit → wait → read workflow without changing transcription processing.

## What Changes

- Open history transcripts in an accessible reader with copy and TXT/Markdown download actions.
- Search history by title or author and filter by source.
- Notify users when a tracked job completes and link to its highlighted history result.
- Show actionable errors for history loading, copy, deletion, queue polling, retry, cancellation and dismissal. Preserve failed jobs when retry submission fails.

## Capabilities

### New Capabilities

- `transcript-reader`: Read and export saved transcripts from the history list.
- `task-operation-feedback`: Reliable completion feedback and errors for task operations.

### Modified Capabilities

- `transcription-history`: Search and filter saved results, with visible loading errors.

## Impact

Primarily `public/index.html`; add a backward-compatible optional job completion query to `/api/jobs` in `src/index.ts` and `src/db.ts`. No schema migrations or new runtime dependencies. Existing clients retain the active-only jobs response by default. Existing persisted history and audio caches are preserved.
