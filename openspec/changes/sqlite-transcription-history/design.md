## Context

The service is a single Docker container running a Node.js/TypeScript Express app. Transcription results (plain text from Gemini) are currently streamed to the client via SSE and never persisted. There is no database, no auth layer, and no multi-user access. Audio files are cached on Docker volumes (`/data/bilibili-audio`, `/data/snipd-audio`). The frontend is a single `public/index.html` file with vanilla JS.

## Goals / Non-Goals

**Goals:**
- Persist completed URL-based transcription results (Bilibili + Snipd) to SQLite automatically after each `done` event
- Expose `GET /api/transcriptions` and `DELETE /api/transcriptions/:id`
- Render a history table in `public/index.html` below the form with per-row redo and delete
- Survive Docker restarts via a named volume

**Non-Goals:**
- Auth or per-user isolation
- Storing uploaded .m4a transcriptions (no cache, redo impossible)
- Editing transcripts in-place
- Pagination (expected volume: tens to low hundreds of rows)

## Decisions

### SQLite over Supabase
Single-process, single-user service with no cross-service data access needs. SQLite is file-based (Docker volume), zero-infra, and synchronous via `better-sqlite3` — fits the existing codebase style without introducing async DB calls into the SSE handlers. Supabase adds network latency and an external dependency for no benefit at this scale.

### `better-sqlite3` over `node:sqlite` (Node 22 built-in)
Node 22's built-in SQLite module is still experimental (as of 2025) and the API surface is unstable. `better-sqlite3` is battle-tested, synchronous, and has excellent TypeScript types. It is already used in `bilibili-copilot-web` (same repo), so the version, type definitions, and Docker build pattern are already proven.

### `globalThis.__db` singleton with lazy `getDb()` (mirrors bilibili-copilot-web)
Using a module-level variable would work for a plain Express server, but `globalThis.__db` is the established pattern in this repo (`bilibili-copilot-web/lib/db/index.ts`). Lazy initialization via `getDb()` means no separate `initDb()` call is needed at startup — the DB opens on first use.

### Build tools only in the builder Dockerfile stage
`better-sqlite3` compiles a native C++ binding at install time. Rather than installing build tools (`python3 make g++`) in both stages, the builder compiles the binding and the runner stage copies `node_modules` directly from the builder (`COPY --from=builder /app/node_modules`). This matches the spirit of `bilibili-copilot-web`'s approach and keeps the runtime image lean. The current `npm ci --omit=dev` line in the runtime stage is replaced by the copy.

### Additive inline migrations array (mirrors bilibili-copilot-web)
A `MIGRATIONS` array in `src/db.ts` holds `ALTER TABLE` statements, each wrapped in try/catch so they are idempotent on restart. No migration tooling needed for this scale.

### WAL journal mode + foreign_keys
Express handles concurrent requests. WAL allows reads and writes to proceed without blocking each other — a reader will not stall a `GET /api/transcriptions` while an `INSERT` is in progress. `foreign_keys = ON` is set for correctness even though the current schema has no FK relationships; it's the established pragma pair used in `bilibili-copilot-web/lib/db/index.ts`.

### Redo = new row
Keeps history immutable. No `UPDATE` endpoint needed. The old transcript is preserved if a redo produces a different result (model updates, audio changes).

### Insert unconditionally (regardless of `clientGone`)
The transcript is complete whether or not the client is still connected. Persisting unconditionally ensures no rows are missed due to client-side SSE reconnects or tab closes. The `clientGone` guard only suppresses the SSE write, not the DB insert.

### History below the form (not a tab)
Avoids tab-switching friction. The form and history are always visible on a single scroll. Consistent with the existing single-page design.

### `source_url` stores the user-submitted URL (not the resolved canonical URL)
The redo button pre-fills the URL input. Users submitted the original URL; re-submitting it goes through the same resolution flow (short-URL expansion, BVID extraction) as the first time. Storing the canonical URL would expose internal identifiers in the UI.

## Risks / Trade-offs

- **Native binding on Alpine Docker** → Build tools (`python3 make g++`) are needed only in the builder stage. The runner stage copies `node_modules` from builder, so the pre-compiled `.node` file travels with it. If the arch differs between stages (rare for Alpine), the binary must be rebuilt — not a concern for single-platform Docker builds.
- **`/data/db` directory on volume mount** → Docker volume mounts overlay the image's built directory. `getDb()` must call `fs.mkdirSync(path.dirname(dbPath), { recursive: true })` on first open so the directory exists regardless of volume state.
- **DB write failures silently drop rows** → Insert errors are caught and logged as warnings; they do not affect the SSE response. Acceptable for a personal tool — a failed persist is recoverable by re-running the URL.
- **Copying full node_modules from builder** → The runner gets both prod and dev deps unless we prune first. Add `RUN npm prune --omit=dev` in the builder stage after the TypeScript build, before the copy. This replaces the previous `npm ci --omit=dev` in the runner.

## Migration Plan

1. `docker compose down` (stop existing container)
2. `docker compose up --build` (rebuilds image with new deps + Dockerfile changes)
3. New `transcriptions-db` volume is created automatically on first start
4. `getDb()` is called on first API request, creates the table lazily
5. Rollback: remove the `transcriptions-db` volume and revert code — audio caches are unaffected

## Open Questions

None — all design decisions resolved before implementation.
