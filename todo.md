# Todo

## Phase 3 ✅ (complete)

- [x] Wire `bilibili-copilot-web` subtitle fallback → ASR via `callTranscribeService()` (Tailscale hostname, 10-min timeout, graceful unreachable handling)
- [x] Add `downloading` / `uploading` / `transcribing` loading indicators to the React frontend
- [x] End-to-end verification: Copilot Web → Tailscale → Gemini → result displayed in UI

## Backlog

- [ ] **Bilibili subtitle overflow bug** (`bilibili-copilot-web`): switch `player/v2?aid=&cid=` → `web-interface/view?bvid=`, read `.data.subtitle.list` directly to avoid 32-bit int overflow on modern video IDs
- [ ] Redis caching for ASR results (`bilibili:subtitle:${bvid}:${page}`, 7-day TTL)
- [ ] Google Drive download via Service Account
- [ ] Local `.m4a` upload support (up to 100MB)
- [ ] SQLite persistence + 2-year TTL cleanup cron
