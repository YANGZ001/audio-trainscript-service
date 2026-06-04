# Audio Trainscript Service — Usage Guide

A microservice that downloads audio from Bilibili videos and transcribes them using the Gemini API, streamed back as Server-Sent Events (SSE). Includes a built-in browser UI for cross-platform access without scripting.

---

## Prerequisites

- Docker + Docker Compose
- A Bilibili `SESSDATA` cookie value (for authenticated audio download)
- A Google AI Studio API key (for Gemini transcription)

---

## Setup

**1. Copy and fill in the environment file:**

```bash
cp .env.example .env
```

Edit `.env`:

```env
BILIBILI_SESSION_TOKEN=<your SESSDATA cookie value>
GEMINI_API_KEY=<your Google AI Studio API key>
PORT=3001
```

- `BILIBILI_SESSION_TOKEN` — the `SESSDATA` cookie from your logged-in Bilibili browser session. Rotating this requires a container restart.
- `GEMINI_API_KEY` — from [Google AI Studio](https://aistudio.google.com/). Free tier: 15 RPM / 1500 RPD.
- `PORT` — defaults to `3001` if unset.

**2. Start the service:**

```bash
docker compose up --build
```

Or in the background:

```bash
docker compose up -d --build
```

**3. Verify it's running:**

```bash
curl http://localhost:3001/health
# {"status":"ok"}
```

---

## Web UI

The service includes a built-in browser interface — no additional installation needed.

Open **`http://<host>:3001`** in any browser (Chrome, Edge, Firefox).

| Feature | Details |
|---|---|
| **Bilibili URL** | Paste a `bilibili.com/video/BV...` URL and click Transcribe |
| **File Upload** | Drag-and-drop or browse for a `.m4a` file (max 100 MB) |
| **Progress** | Real-time status: download %, uploading, transcribing |
| **Output** | Timestamped plain text (`[MM:SS] content` per segment) |
| **Copy** | One-click copy to clipboard |
| **Model** | Dropdown to select the Gemini model (defaults to `gemini-3.1-flash-lite`) |

> The web UI is the recommended access method for Windows users, where the shell scripts cannot be reused directly.

---

## API

### `POST /api/transcribe`

Starts a transcription job. Streams progress and results as SSE.

**Request:**

```http
POST /api/transcribe
Content-Type: application/json

{
  "type": "bilibili",
  "url": "https://www.bilibili.com/video/BV1heV86BEZv/"
}
```

**Response:** `text/event-stream` (SSE)

The stream emits the following events in order:

| Event | Data | Description |
|---|---|---|
| `downloading` | `{"progress": 0–100}` | Audio download progress (%) |
| `uploading` | `{}` | Audio file is being uploaded to Gemini |
| `transcribing` | `{}` | Gemini is processing the audio |
| `done` | Array of segment objects | Final transcript |
| `error` | `{"error": "<message>"}` | Any failure at any stage |

**`done` payload — segment object:**

```json
[
  { "from": 0.0, "to": 4.5, "content": "Hello, welcome to this video." },
  { "from": 4.5, "to": 9.1, "content": "Today we'll cover..." }
]
```

Fields: `from` / `to` are timestamps in seconds (float); `content` is the transcribed text.

---

## Quick Test

### Bilibili URL

Use the included `test.sh` script to hit the API and pretty-print results:

```bash
./test.sh 'https://www.bilibili.com/video/BV1heV86BEZv/'
```

**Output example:**

```
Host : http://localhost:3001
Video: https://www.bilibili.com/video/BV1heV86BEZv/

[downloading] [####################] 100%
[uploading to Gemini...]
[transcribing...]

=== TRANSCRIPT (42 segments) ===
  0:00.00 -> 0:04.50   Hello, welcome to this video.
  0:04.50 -> 0:09.10   Today we'll cover...
  ...

Done.
```

**Custom host** (e.g. via Tailscale):

```bash
TRANSCRIBE_HOST=http://my-server:3001 ./test.sh 'https://www.bilibili.com/video/...'
```

**Raw curl** (without the pretty-printer):

```bash
curl -s --no-buffer -N \
  -H "Content-Type: application/json" \
  -d '{"type":"bilibili","url":"https://www.bilibili.com/video/BV1heV86BEZv/"}' \
  http://localhost:3001/api/transcribe
```

---

### Local `.m4a` File

Use `transcribe-file.sh` to upload a local audio file and pretty-print the transcript:

```bash
./transcribe-file.sh ~/recordings/interview.m4a
```

**Output example:**

```
Host : http://localhost:3001
File : /Users/you/recordings/interview.m4a

[uploading to Gemini...]
[transcribing...]

=== TRANSCRIPT (18 segments) ===
  0:00.00 -> 0:05.20   Hello, today we're going to talk about...
  ...

Done.
```

**Custom host:**

```bash
TRANSCRIBE_HOST=http://my-server:3001 ./transcribe-file.sh ~/recordings/interview.m4a
```

**Raw curl** (without the pretty-printer):

```bash
curl -s --no-buffer -N \
  -F "file=@/path/to/audio.m4a;type=audio/mp4" \
  http://localhost:3001/api/upload-transcribe
```

> The `;type=audio/mp4` suffix is required — macOS curl sends `application/octet-stream` for unknown extensions by default, which the service rejects.

---

## API Reference

### `POST /api/upload-transcribe`

Accepts a local audio file and streams back the transcript as SSE.

**Request:** `multipart/form-data` with a single field named `file` containing a `.m4a` audio file (max 100 MB).

**Response:** `text/event-stream` (SSE)

| Event | Data | Description |
|---|---|---|
| `uploading` | `{}` | File is being uploaded to Gemini |
| `transcribing` | `{}` | Gemini is processing the audio |
| `done` | Array of segment objects | Final transcript |
| `error` | `{"error": "<message>"}` | Any failure |

Pre-stream errors (wrong file type, file too large, missing field) are returned as plain JSON with HTTP 400 / 413 — not as SSE events.

---

## Model Selection

Both endpoints accept an optional `?model=` query parameter. If omitted, the server defaults to `gemini-3.1-flash-lite`.

```bash
# Via shell scripts — set the MODEL env var
MODEL=gemini-2.5-flash ./transcribe-file.sh interview.m4a
MODEL=gemini-2.5-pro   ./test.sh 'https://www.bilibili.com/video/...'

# Via raw curl
curl -s --no-buffer -N \
  -F "file=@interview.m4a;type=audio/mp4" \
  http://zyfun-ubuntu26:3001/api/upload-transcribe?model=gemini-2.5-flash
```

An invalid model name is rejected by the Gemini API and surfaces as an `error` SSE event — the service itself does not validate model names.

---

## Error Reference

| Error message | Likely cause |
|---|---|
| `Failed to resolve Bilibili stream URL` | `BILIBILI_SESSION_TOKEN` is expired or wrong |
| `Download failed` | Network issue or video is region-locked |
| `Gemini upload failed` | Invalid or quota-exhausted `GEMINI_API_KEY` |
| `Request body must include type: "bilibili" and a url string` | Malformed request body |

---

## Stopping / Restarting

```bash
docker compose down          # stop
docker compose up -d         # restart (no rebuild)
docker compose up --build -d # restart with rebuild
```

To rotate the Bilibili session token: update `.env`, then `docker compose down && docker compose up -d`.
