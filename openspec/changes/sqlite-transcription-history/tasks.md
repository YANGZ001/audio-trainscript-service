## 1. Infrastructure

- [x] 1.1 Add `better-sqlite3` to `dependencies` and `@types/better-sqlite3` to `devDependencies` in `package.json`
- [x] 1.2 Add `apk add --no-cache python3 make g++` before `npm ci` in the **builder stage** of `Dockerfile` (build tools needed only here)
- [x] 1.3 Add `RUN npm prune --omit=dev` in the builder stage after `npm run build` (prune devDeps before copying)
- [x] 1.4 In the **runtime stage** of `Dockerfile`: replace `RUN npm ci --omit=dev` with `COPY --from=builder /app/node_modules ./node_modules` (copies pre-compiled `better-sqlite3` binary)
- [x] 1.5 Add `/data/db` to the `mkdir -p` line in `Dockerfile` runtime stage and update `chown` accordingly
- [x] 1.6 Add `transcriptions-db` named volume to `docker-compose.yml` and mount it at `/data/db` in the service
- [x] 1.7 Add `DB_PATH=/data/db/transcriptions.db` to the `environment` block in `docker-compose.yml`

## 2. Database Module

- [x] 2.1 Create `src/db.ts` — use `globalThis` singleton pattern (mirrors `bilibili-copilot-web/lib/db/index.ts`): `const g = globalThis as typeof globalThis & { __db?: Database.Database }`
- [x] 2.2 In `getDb()`: call `fs.mkdirSync(path.dirname(dbPath), { recursive: true })`, open DB, set `journal_mode = WAL` and `foreign_keys = ON` pragmas, run `CREATE TABLE IF NOT EXISTS`, run inline `MIGRATIONS` array with try/catch per migration
- [x] 2.3 Export `TranscriptionRow` interface: `{ id, source_type, source_url, title, owner_name, duration, transcript, created_at }`
- [x] 2.4 Export `insertTranscription(params)` — prepared INSERT, returns inserted `id` as number
- [x] 2.5 Export `listTranscriptions()` — prepared `SELECT * FROM transcriptions ORDER BY created_at DESC`
- [x] 2.6 Export `deleteTranscription(id: number)` — prepared `DELETE FROM transcriptions WHERE id = ?`

## 3. Backend API

- [x] 3.1 Import `{ insertTranscription, listTranscriptions, deleteTranscription }` from `./db` in `src/index.ts` (no `initDb` — lazy via `getDb()`)
- [x] 3.2 After `sendEvent('done', ...)` in the Bilibili branch (line 175), call `insertTranscription({ source_type: 'bilibili', source_url: url, ...meta, transcript })`; wrap in try/catch that logs a warning on failure
- [x] 3.3 Same insert after `sendEvent('done', ...)` in the Snipd branch (line 227), with `source_type: 'snipd'`
- [x] 3.4 Add `GET /api/transcriptions` route — call `listTranscriptions()`, return as JSON; 500 on error
- [x] 3.5 Add `DELETE /api/transcriptions/:id` route — validate id is a positive integer (400 if not), call `deleteTranscription`, return 204; 500 on DB error

## 4. Frontend

- [x] 4.1 Add CSS for `.history-section`, `.history-title`, `.history-table` (th/td), `.history-empty`, `.btn-xs` inside the existing `<style>` block in `public/index.html`; reuse existing CSS variables (`--bg`, `--surface`, `--border`, `--muted`, `--error`, `--amber`)
- [x] 4.2 Add history section HTML below the output panel inside `.container`: `<div id="history-section">` with `<div id="history-body">` placeholder
- [x] 4.3 Add `escapeHtml(str)` helper (escapes `& < > "`) to prevent XSS from API-sourced title/URL content
- [x] 4.4 Add `formatDuration(seconds)` → `"5m 03s"` / `"1h 12m"` / `"—"` helper
- [x] 4.5 Add `formatDate(iso)` → locale date + time string helper
- [x] 4.6 Add `renderHistory(rows)` — builds table with columns (title/owner, type, date, duration, actions); buttons use `data-action`, `data-id`, `data-url` attributes (not inline onclick with string interpolation)
- [x] 4.7 Add `loadHistory()` — fetches `GET /api/transcriptions`, calls `renderHistory()`
- [x] 4.8 Add `redoTranscription(url)` — switches to URL tab, sets `#url-input` value, calls `startTranscription()`
- [x] 4.9 Add `deleteHistoryRow(id, btn)` — calls `DELETE /api/transcriptions/:id`, then `loadHistory()` on success; re-enables button on failure
- [x] 4.10 Add delegated click listener on `#history-body` dispatching redo/delete by reading `data-action`/`data-id`/`data-url` from the clicked button
- [x] 4.11 Add `let lastTranscriptionWasUrl = false;` at module scope; set to `(activeTab === 'url')` at the start of `startTranscription()`
- [x] 4.12 In `handleEvent` `done` branch: add `if (lastTranscriptionWasUrl) loadHistory();`
- [x] 4.13 Call `loadHistory()` at end of `<script>` block for initial page load

## 5. Verification

- [x] 5.1 Run `docker compose up --build` — confirm no build errors (native binding compiles in builder stage, copies cleanly to runner)
- [ ] 5.2 Submit a Bilibili URL — confirm SSE `done` fires, transcript appears, history table gains a new row
- [x] 5.3 `curl localhost:3002/api/transcriptions` — returns `[]`, DELETE 204/400 validated
- [ ] 5.4 Click **Del** on a history row — confirm row removed from UI; `curl` confirms it's gone from DB
- [ ] 5.5 Click **Redo** — confirm URL input is pre-filled, transcription runs, history gains a second row, original row still present
- [ ] 5.6 Submit a `.m4a` upload — confirm history table does NOT gain a new row
- [ ] 5.7 `docker compose down && docker compose up` — confirm history persists across restarts
