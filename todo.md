# Todo

## Phase 3 (next up)

- [ ] Wire `bilibili-copilot-web` subtitle fallback → `POST /api/transcribe` (Tailscale hostname, 10-min timeout, graceful unreachable handling)
- [ ] Add `downloading` / `uploading` / `transcribing` loading indicators to the React frontend
- [ ] End-to-end verification: Copilot Web → Tailscale → Gemini → result displayed in UI

## Backlog

- [ ] **Bilibili subtitle overflow bug** (`bilibili-copilot-web`): switch `player/v2?aid=&cid=` → `web-interface/view?bvid=`, read `.data.subtitle.list` directly to avoid 32-bit int overflow on modern video IDs
- [ ] Redis caching for ASR results (`bilibili:subtitle:${bvid}:${page}`, 7-day TTL)
- [ ] Google Drive download via Service Account
- [ ] Local `.m4a` upload support (up to 100MB)
- [ ] SQLite persistence + 2-year TTL cleanup cron
