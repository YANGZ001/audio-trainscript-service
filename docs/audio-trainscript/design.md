# Audio Trainscript Service — Technical Design

## Data Model (Initial Version)

The initial version of `audio-trainscript-service` is **stateless**. It does not persist transcripts to a database; instead, it processes requests on-the-fly, streams results back to the client, and immediately cleans up local audio files.

*Note: Database storage (SQLite) is deferred to the Future Todo backlog.*

---

## Core Flows

### 1. Bilibili Audio ASR Flow (Active Scope)
```
Client (Copilot Web)                     Audio Trainscript Service         Bilibili API / Gemini API
        │                                         │                                    │
        ├─ POST /api/transcribe (bilibili URL) ──→│                                    │
        │                                         ├─ Fetch audio playurl ─────────────→│
        │                                         │←─ Return audio stream URL ─────────┤
        │                                         ├─ Download audio to temp disk       │
        │                                         ├─ Upload file to Gemini File API ──→│
        │                                         ├─ Invoke gemini-3.1-flash-lite ASR ───→│
        │                                         │←─ Return JSON timestamped text ────┤
        │                                         ├─ Delete temp audio file            │
        │←─ SSE Stream: Progress & JSON Result ───┤                                    │
```

**Error paths**: If Bilibili returns 403/404, or Gemini returns an error or quota-exceeded response, the service must emit an `error` SSE event and close the stream. If the process crashes after uploading to Gemini File API but before deleting, the orphaned cloud file must be cleaned up on the next startup (startup scan via `googleai.listFiles()` deletes any files older than 1 hour).

### 2. Google Drive & Local Upload Flow (Future Todo)
- To be implemented when Service Account OAuth and file upload controllers are introduced.

---

## API Design

### `GET /health`
Health check. Returns `200 OK` with body `{"status":"ok"}`. Used by Docker and Tailscale monitoring.

---

### `POST /api/transcribe`
Submit a Bilibili video URL for transcription. Returns a Server-Sent Events (SSE) stream.

**Audio limits**: Maximum 200MB audio file or 3 hours duration. Requests exceeding these limits receive an `error` SSE event immediately after the download step.

**Request headers**
- `Content-Type: application/json`

**Response headers** (set by Express before streaming begins)
- `Content-Type: text/event-stream`
- `Cache-Control: no-cache`
- `Connection: keep-alive`

**Request Body**
```json
{
  "type": "bilibili",
  "url": "https://www.bilibili.com/video/BV1xxx"
}
```

**SSE Event Types**
- `downloading`: Sent while downloading audio from B站. Payload: `{"progress": number}` (integer 0–100)
- `uploading`: Sent while uploading file to Gemini File API.
- `transcribing`: Sent while Gemini 3.1 Flash Lite is running the transcription.
- `done`: Final success event. Payload: The JSON transcription array:
  ```json
  [
    { "from": 0, "to": 4, "content": "字幕内容..." },
    { "from": 4, "to": 8, "content": "第二句字幕..." }
  ]
  ```
- `error`: Sent on failure. Payload: `{"error": string}`

---

## Environment Configuration

| Variable | Required | Description |
|---|---|---|
| `BILIBILI_SESSION_TOKEN` | Yes | Browser session cookie for resolving restricted audio streams. Injected at container startup via `docker-compose.yml`. Rotate by restarting the container. |
| `GEMINI_API_KEY` | Yes | Google AI Studio free-tier API key for `gemini-3.1-flash-lite`. |
| `PORT` | No | HTTP listen port (default: `3000`). |

**Networking**: `bilibili-copilot-web` calls this service using its Tailscale MagicDNS hostname (e.g. `http://<hostname>:3000`). No shared Docker network is required.

---

## Directory Structure (Initial Version)

```
audio-trainscript-service/
  ├── docs/audio-trainscript/   # Feature documentation
  ├── src/
  │    ├── services/
  │    │    ├── bilibili.ts     # Bilibili playurl resolver & audio stream downloader
  │    │    └── gemini.ts       # Gemini File API uploader & 3.1 Flash Lite ASR runner
  │    └── index.ts             # Express server & SSE route handler
  ├── Dockerfile
  ├── docker-compose.yml
  ├── package.json
  └── tsconfig.json
```

---

## Future Todo Design Backlog

### SQLite Persistent Storage
- Add `better-sqlite3` and `src/db/` directory.
- Database Schema:
  - Table: `transcripts` (id TEXT, source_type TEXT, source_id TEXT, title TEXT, content TEXT, created_at DATETIME).
- TTL Worker: `src/cron.ts` running a daily job:
  ```sql
  DELETE FROM transcripts WHERE created_at < DATETIME('now', '-2 years');
  ```

### Google Drive Download (Service Account)
- Introduce `src/services/gdrive.ts`.
- Integrate `@googleapis/drive` and authenticate using `service-account.json`.

### Direct Uploads (.m4a)
- Enable multipart upload routing and limit sizes to 100MB.
