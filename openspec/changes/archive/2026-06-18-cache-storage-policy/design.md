## Context

Two storage issues exist today:

1. **Unbounded audio cache.** `transcribePipeline.ts` keys cached audio by content id under `/data/{bilibili,snipd,xiaoyuzhou}-audio/`. `isCacheHit` treats files older than `CACHE_TTL_MS` (90 days) as misses and overwrites them on the next request — but a file that is *never re-requested* is never deleted. The cache grows for the life of the volume.

2. **Duplicate history rows.** `worker.ts` calls `insertTranscription({ source_url: job.source_url, … })` unconditionally. `source_url` is the **raw** user-submitted URL, so the same content under different URL forms (b23.tv short links, query-param variants) is not recognized, and every re-submit inserts another row. The pipeline already computes a stable id (`bvid` / episode UUID / episode id, carried internally as `tag`) but drops it before persistence.

Existing patterns to build on: the worker loop already runs `pruneDoneJobs` and `pruneApiCalls` each iteration; the DB layer (`db.ts`) initializes a `globalThis` singleton from a `SCHEMA` string and prepares named statements.

## Goals / Non-Goals

**Goals:**
- Bound audio cache disk usage via active, age-based eviction aligned with the existing 90-day TTL.
- Persist one history row per `(source_type, content_id)`, replacing on re-transcription (upsert).
- Make dedup robust to URL form by keying on the normalized content id, not the raw URL.

**Non-Goals:**
- Hard size-cap / LRU eviction for the cache (age sweep only; revisit if 90 days of media still overflows).
- Backfilling `content_id` for pre-existing history rows by re-deriving from network (no `resolveShortUrl` calls during migration).
- Changing the `GET /api/transcriptions` or `DELETE /api/transcriptions/:id` API shapes.
- Restoring any "force re-transcribe" UI affordance (out of scope; upsert already refreshes on re-submit).

## Decisions

### Decision 1: Periodic sweep on the worker loop (not request-triggered, not setInterval)
Add `pruneAudioCache()` invoked from the worker loop with a 24-hour interval guard (a module-level "last run" timestamp), matching how `pruneDoneJobs`/`pruneApiCalls` already run.

- **Why not request-triggered/async:** a per-request delete only self-heals the file being requested (already handled by overwrite-on-miss); catching never-re-requested files needs a full-dir scan regardless. Traffic-triggered cleanup runs too often when busy and never when idle — backwards from the goal.
- **Why not `setInterval`:** the worker loop is the established scheduling surface; reusing it keeps one timing model and avoids a second timer to reason about on shutdown.
- The sweep does `readdir` over each cache dir, `stat` each entry, and `unlink` any file with `mtime` older than `CACHE_TTL_MS` (the same constant that defines a cache miss). It deletes both `<id>.<ext>` audio and the adjacent `<id>.json` sidecar when stale. Errors are caught and logged; the loop continues.

### Decision 2: `content_id` column + UNIQUE index, upsert via `ON CONFLICT`
Add `content_id TEXT` to the `transcriptions` table and a `UNIQUE (source_type, content_id)` index. Change the insert statement to `INSERT INTO transcriptions (…) VALUES (…) ON CONFLICT(source_type, content_id) DO UPDATE SET transcript=excluded.transcript, title=excluded.title, owner_name=excluded.owner_name, duration=excluded.duration, model=excluded.model, source_url=excluded.source_url, created_at=excluded.created_at`.

- **Why `(source_type, content_id)` not `content_id` alone:** ids are only unique within a source; composite avoids cross-source collisions.
- **Why store the raw `source_url` too:** keep it as a human-readable record of what was submitted (updated to the latest form on upsert); dedup keys on `content_id`.
- **Threading the id:** `transcribeFromUrl` already builds `tag` internally; return it (e.g. `{ source_type, transcript, meta, contentId }`) so `worker.ts` can pass it to `insertTranscription`.

### Decision 3: Additive migration, legacy rows left as NULL
The DB initializes via a `SCHEMA` string with `CREATE TABLE IF NOT EXISTS`, so existing volumes already have the old table. On init, detect the missing column with `PRAGMA table_info(transcriptions)` and run `ALTER TABLE transcriptions ADD COLUMN content_id TEXT` when absent, then `CREATE UNIQUE INDEX IF NOT EXISTS`.

- Pre-existing rows keep `content_id = NULL`. SQLite treats `NULL`s as distinct in a UNIQUE index, so legacy rows never collide and are never upserted-over — acceptable; they simply won't dedup against future runs until re-transcribed (which writes a real `content_id`).
- **Alternative considered — best-effort regex backfill** (parse `bvid`/episode id from stored `source_url` without network): deferred to keep the migration trivial and side-effect-free; can be added later if duplicate legacy rows prove annoying.

## Risks / Trade-offs

- **Sweep deletes a file mid-use** → The sweep only targets files ≥90 days old; an in-flight transcription either just downloaded the file (fresh `mtime`) or had a cache hit (fresh by definition), so no active file qualifies. No locking needed.
- **UNIQUE index fails to create on a volume with pre-existing duplicate content** → there is no `content_id` on legacy rows, so the new index spans only NULLs (no conflict) plus new rows; index creation is safe. New duplicates cannot arise because the upsert is the only writer.
- **Losing transcript history / alternate-model versions** → upsert overwrites the prior transcript for the same content (an accepted product decision: one copy per id, latest wins).
- **Migration runs on every boot** → guarded by `PRAGMA table_info` check and `IF NOT EXISTS`; idempotent and cheap.

## Migration Plan

1. Ship schema change: `ALTER TABLE … ADD COLUMN content_id` (guarded) + `CREATE UNIQUE INDEX IF NOT EXISTS idx_transcriptions_source_content ON transcriptions(source_type, content_id)`.
2. Deploy normally via `docker compose up --build`; existing rows keep NULL `content_id`.
3. Rollback: revert code; the extra `content_id` column and index are inert for the old code path (insert ignores them), so no destructive down-migration is required.
