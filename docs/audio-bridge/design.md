# Audio Bridge Service — Technical Design

## Data Model

The database is built on SQLite and stores only the final text transcripts (in JSON format) to minimize storage overhead. Audio files are deleted immediately after transcription completes.

### `transcripts` table

| Field | Type | Description |
|---|---|---|
| `id` | TEXT (UUID) | Primary Key; unique identifier for the transcript |
| `source_type` | TEXT | Enum: `'bilibili'` / `'gdrive'` / `'upload'` |
| `source_id` | TEXT | Identifier (e.g., BVID for Bilibili, File ID for GDrive, or original filename for uploads) |
| `title` | TEXT | Title of the audio/video |
| `content` | TEXT | JSON-serialized array of subtitle objects `[ { "from": number, "to": number, "content": string } ]` |
| `created_at` | DATETIME | ISO 8601 string of when the transcription was created. Used for TTL expiration. |

---

## Core Flows

### 1. Bilibili Audio Fallback Flow
```
Client (Copilot Web)                     Audio Bridge Service              Bilibili API / Gemini API
        │                                         │                                    │
        ├─ POST /api/transcribe (bilibili URL) ──→│                                    │
        │                                         ├─ Fetch audio playurl ─────────────→│
        │                                         │←─ Return audio stream URL ─────────┤
        │                                         ├─ Download audio to temp disk       │
        │                                         ├─ Upload file to Gemini File API ──→│
        │                                         ├─ Invoke Gemini 1.5 Flash ASR ─────→│
        │                                         │←─ Return JSON timestamped text ────┤
        │                                         ├─ Write to SQLite & Delete temp file│
        │←─ SSE Stream: Progress & JSON Result ───┤                                    │
```

### 2. Google Drive Flow (using Service Account)
```
Client (cURL / Script)                   Audio Bridge Service              Google Drive / Gemini API
        │                                         │                                    │
        ├─ POST /api/transcribe (gdrive fileId) ─→│                                    │
        │                                         ├─ Auth using service-account.json ─→│
        │                                         ├─ Download m4a file to temp disk ──→│
        │                                         ├─ Upload file to Gemini File API ──→│
        │                                         ├─ Invoke Gemini 1.5 Flash ASR ─────→│
        │                                         │←─ Return JSON transcript ──────────┤
        │                                         ├─ Write to SQLite & Delete temp file│
        │←─ SSE Stream: Progress & JSON Result ───┤                                    │
```

---

## API Design

### `POST /api/transcribe`
Submit an audio source for transcription. Returns a Server-Sent Events (SSE) stream.

**Headers**
- `Content-Type: application/json` or `multipart/form-data` (for direct file uploads)

**Request Body (JSON for links)**
```json
{
  "type": "bilibili" | "gdrive",
  "url": "https://www.bilibili.com/video/BV1xxx" // For Bilibili
  // OR
  "fileId": "1xyzGdriveFileId" // For Google Drive
}
```

**SSE Event Types**
- `downloading`: Sent while fetching/saving audio locally. Payload: `{"progress": number}`
- `uploading`: Sent while uploading file to Gemini File API. Payload: `{"progress": number}`
- `transcribing`: Sent while Gemini is processing the ASR model.
- `done`: Final success event. Payload: The JSON transcription array and SQLite record ID.
- `error`: Sent on failure. Payload: `{"error": string}`

---

### `GET /api/transcripts/:id`
Retrieve a previously completed transcript from SQLite.

**Response (200 OK)**
```json
{
  "id": "uuid-xxx",
  "source_type": "bilibili",
  "source_id": "BV1xxx",
  "title": "Video Title",
  "content": [
    { "from": 0, "to": 4, "content": "Hello world" },
    { "from": 4, "to": 8, "content": "Welcome to the tutorial" }
  ],
  "created_at": "2026-06-01T01:30:00Z"
}
```

---

## Storage Rationale

- **Database**: SQLite (`better-sqlite3`) is chosen because the deployment target is a single personal server. It requires no separate daemon, has a tiny CPU/RAM footprint, and handles transactional writes reliably.
- **TTL Mechanism**: A Node-Cron scheduler running inside the Node.js container runs every 24 hours to delete records where `created_at < datetime('now', '-2 years')`.

---

## Directory Structure

```
audio-bridge-service/
  ├── docs/audio-bridge/   # Feature docs
  ├── data/                # SQLite persistent volume mount
  ├── src/
  │    ├── db/
  │    │    ├── index.ts   # Database connection singleton
  │    │    └── schema.sql # Table schema setup
  │    ├── services/
  │    │    ├── bvid.ts    # Bilibili playurl resolver & downloader
  │    │    ├── gdrive.ts  # Google Drive API downloader using Service Account
  │    │    └── gemini.ts  # Gemini File API upload and ASR call
  │    ├── index.ts        # Express/Fastify server & routes (SSE, GET, DELETE)
  │    └── cron.ts         # Periodic 2-year TTL cleanup job
  ├── service-account.json # Google Cloud Service Account credentials (ignored in git)
  ├── Dockerfile
  ├── docker-compose.yml
  ├── package.json
  └── tsconfig.json
```
