## Why

Every transcription result is currently ephemeral — streamed once to the client and discarded. Users have no way to review, revisit, or re-run past transcriptions without re-submitting the URL.

## What Changes

- Introduce a SQLite database (via `better-sqlite3`) persisted on a Docker volume to store completed transcriptions
- After each successful URL-based transcription (Bilibili or Snipd), automatically save the result to the DB
- Add two new API endpoints: `GET /api/transcriptions` (list all) and `DELETE /api/transcriptions/:id`
- Add a History section below the transcription form showing all past results with **Redo** (re-transcribe, new row) and **Delete** actions
- Uploaded .m4a transcriptions remain ephemeral (no cache, redo impossible)

## Capabilities

### New Capabilities

- `transcription-history`: Persist completed URL-based transcriptions to SQLite; expose list and delete endpoints; render a history table in the UI with redo and delete per row

### Modified Capabilities

<!-- No existing spec-level behavior changes -->

## Impact

- **New file**: `src/db.ts` — SQLite singleton, schema, CRUD
- **Modified**: `src/index.ts` — import db, call `initDb()`, insert after Bilibili/Snipd `done` events, two new routes
- **Modified**: `public/index.html` — history section HTML/CSS/JS
- **Modified**: `Dockerfile` — add `python3 make g++` (node-gyp deps for `better-sqlite3`) to both stages; add `/data/db` directory
- **Modified**: `docker-compose.yml` — add `transcriptions-db` named volume, `DB_PATH` env var
- **Modified**: `package.json` — add `better-sqlite3` and `@types/better-sqlite3`
- **No breaking changes** to existing SSE API or audio caching behavior
