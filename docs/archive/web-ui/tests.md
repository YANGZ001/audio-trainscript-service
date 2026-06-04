# Web UI — Tests

## Manual Test Scenarios

### Golden Path: Bilibili URL

1. Open `http://localhost:3001` in browser (or the Tailscale hostname on port 3001)
2. Confirm "Bilibili URL" tab is active by default
3. Paste a valid BV URL into the input field
4. Click **Transcribe**
5. Expect: status shows "Downloading… N%", then "Uploading to Gemini…", then "Transcribing…"
6. Expect: status shows "done" in green, char count shows "N chars · N segments"
7. Expect: transcript textarea contains non-empty plain text, each line prefixed with `[MM:SS]` timestamp
8. Click **Copy All** → paste into a text editor, confirm full transcript is there

### Golden Path: File Upload

1. Switch to "File Upload" tab
2. Drop a `.m4a` file onto the drop zone (or click to browse)
3. Expect: drop zone turns green and shows filename + size
4. Click **Transcribe**
5. Expect: "Uploading to Gemini…" → "Transcribing…" → "Done" with transcript

### Model Selector

1. Change model to `gemini-2.5-flash`
2. Submit a request
3. Check server logs: confirm `model: gemini-2.5-flash` appears in the transcription-done log line

### Error Cases

| Scenario | Expected UI |
|---|---|
| Empty URL field | "please enter a bilibili url" in red, no request sent |
| No file selected (file tab) | "please select a .m4a file" in red, no request sent |
| Invalid Bilibili URL (server rejects) | Server `error` SSE event text shown in red |
| Non-.m4a file selected | Server returns 400, error message shown |
| Network unreachable | "Network error: …" in red |

### Drag-and-Drop

1. Open File Upload tab
2. Drag a `.m4a` file from file explorer onto the drop zone
3. Expect: drop zone highlights on dragover, shows file name on drop

### Regression Checks

- `GET /health` still returns `{"status":"ok"}` (server unaffected by static middleware)
- `/api/transcribe` and `/api/upload-transcribe` still work from `curl` (no regression)
- Docker container builds cleanly: `docker compose up --build`
- No TypeScript compile errors after `src/index.ts` change

## Automated Tests

No automated browser tests added in this phase. The manual test scenarios above cover the golden path and key error cases. If automated testing is added later, test files live under `test/`.
