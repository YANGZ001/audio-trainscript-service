## 1. Audio cache eviction

- [x] 1.1 Add `pruneAudioCache()` to `src/services/transcribePipeline.ts` that scans the three cache dirs, `stat`s each entry, and `unlink`s files (audio + `<id>.json` sidecar) whose `mtime` is older than `CACHE_TTL_MS`; wrap in try/catch and log errors.
- [x] 1.2 In `src/queue/worker.ts`, call `pruneAudioCache()` from the loop with a 24-hour interval guard (module-level last-run timestamp), alongside the existing `pruneDoneJobs`/`pruneApiCalls` calls.

## 2. Content-id persistence (schema + migration)

- [x] 2.1 In `src/db.ts`, add a `CREATE UNIQUE INDEX IF NOT EXISTS idx_transcriptions_source_content ON transcriptions(source_type, content_id)` migration (added to the existing `MIGRATIONS` array rather than `SCHEMA`, matching the existing `model` column pattern).
- [x] 2.2 Add the `content_id` column via the existing `MIGRATIONS` array (`ALTER TABLE transcriptions ADD COLUMN content_id TEXT`), which is already wrapped in try/catch and idempotent for fresh and existing DBs — no separate PRAGMA guard needed.
- [x] 2.3 Add `content_id` to the `TranscriptionRow` / insert input types.

## 3. Upsert wiring

- [x] 3.1 Change the insert prepared statement to `INSERT … ON CONFLICT(source_type, content_id) DO UPDATE SET …` and return the upserted id via `RETURNING id` (lastInsertRowid is stale on the UPDATE path).
- [x] 3.2 Return the content id (`tag`) from `transcribeFromUrl` in `src/services/transcribePipeline.ts` (added `content_id` to the result shape).
- [x] 3.3 In `src/queue/worker.ts`, pass `content_id` from the pipeline result into `insertTranscription`.

## 4. Verification

- [x] 4.1 `docker compose up --build` succeeds and the service starts on port 3001.
- [x] 4.2 Verified upsert dedup by `(source_type, content_id)`: inserting the same `bvid` under two URL forms returns the same row id and keeps one row with latest title/url/model. (Verified directly against compiled `insertTranscription` on a throwaway DB rather than a full live double-transcription.)
- [x] 4.3 Confirmed a pre-existing DB migrates cleanly on boot (`content_id` column + unique index added, legacy rows NULL and still listed by `GET /api/transcriptions`).
- [x] 4.4 Aged a cache file (`touch -d 2026-01-01`), ran `pruneAudioCache()`, confirmed the stale audio + sidecar were deleted while the fresh marker and all 32 real cached files remained.
