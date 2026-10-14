## 1. Config

- [x] 1.1 In `config/rate-limits.json`, add `"gemini-flash-lite-latest": { "rpm": 5, "rpd": 20 }` to `models`
- [x] 1.2 Set `fallback` to `["gemini-flash-lite-latest", "gemini-3.1-flash-lite", "gemini-2.5-flash-lite", "gemini-3.5-flash"]`
- [x] 1.3 Remove `gemini-2.5-flash` from `models`

## 2. Verify

- [x] 2.1 `docker compose up --build -d`, then confirm the boot log has no "fallback chain has unknown models" warning
- [x] 2.2 Submit a short transcription job to `http://localhost:3001` and confirm it completes with model `gemini-flash-lite-latest`
