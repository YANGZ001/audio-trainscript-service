## Why

The audio cache has a 90-day TTL that is read-side only: stale files are ignored on read but never deleted, so the cache volumes grow without bound from one-off transcriptions. Separately, re-submitting the same content inserts a duplicate transcription row every time, accumulating redundant history for identical media.

## What Changes

- Add a periodic background sweep (on the worker loop, guarded by an interval) that deletes audio cache files older than the existing 90-day TTL across all three cache directories, reclaiming disk even while the service is otherwise idle.
- Change transcription persistence from unconditional insert to **upsert keyed by normalized content id**: one row per `(source_type, content_id)`, replacing the existing row's transcript and metadata on re-transcription instead of inserting a duplicate.
- Thread the stable content id (`bvid` / Snipd episode UUID / Xiaoyuzhou episode id) — already computed in the pipeline but currently dropped — through to persistence so dedup is reliable regardless of the raw URL form submitted (b23.tv short links, query-param variants).

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `audio-file-cache`: Adds active time-based eviction — a periodic sweep deletes cache files older than the 90-day TTL. The existing "not deleted after transcription" guarantee is unchanged (eviction is age-based, not request-scoped).
- `transcription-history`: Persistence becomes an upsert keyed by normalized content id; a repeat transcription of the same content replaces the existing row rather than inserting a duplicate.

## Impact

- **Code:**
  - `src/services/transcribePipeline.ts` — return the content id (`tag`) from `transcribeFromUrl`; add a `pruneAudioCache` sweep over the three cache dirs.
  - `src/queue/worker.ts` — call the sweep on the loop with an interval guard (alongside `pruneDoneJobs` / `pruneApiCalls`); pass content id into `insertTranscription`.
  - `src/db.ts` — add a `content_id` column + UNIQUE `(source_type, content_id)` index to the `transcriptions` table; change the insert statement to `INSERT … ON CONFLICT DO UPDATE`.
- **Data:** existing `transcriptions` rows have no `content_id`; a migration must backfill or tolerate NULLs (see design.md).
- **Behavior:** re-transcribing previously transcribed content no longer creates a second history row; the history list shows one (latest) entry per content id.
- **No API surface change:** `GET /api/transcriptions` and `DELETE /api/transcriptions/:id` keep their shapes.
