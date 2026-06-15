# Audio Trainscript Service

A microservice that downloads audio from Bilibili, Snipd, and Xiaoyuzhou (小宇宙) and transcribes it using the Gemini API, streamed back as Server-Sent Events (SSE). Includes a built-in browser UI for cross-platform access without scripting.

---

## System Architecture

The following diagram maps the components, network boundaries, and execution paths of the service.

### Architecture Diagram
GitHub renders this Mermaid flowchart natively:

```mermaid
flowchart LR
    subgraph Clients ["Clients / Consuming Apps"]
        direction TB
        Web["React Web UI<br/>(bilibili-copilot-web)"]
        BrowserUI["Built-in Browser UI<br/>(public/index.html, served at GET /)"]
        CLI["CLI / Shell Scripts<br/>(test/*/run.sh)"]
        cURL["REST API Clients<br/>(cURL / HTTP Clients)"]
    end

    subgraph Service ["Audio Trainscript Service (Docker Container)"]
        direction TB
        Router["Express API Server / Router<br/>(src/index.ts)"]
        Worker["Queue Worker<br/>single FIFO drainer<br/>(src/queue/worker.ts)"]

        subgraph Internal ["Source Services"]
            direction LR
            BiliSrv["Bilibili Service<br/>(src/services/bilibili.ts)"]
            SnipdSrv["Snipd Service<br/>(src/services/snipd.ts)"]
            XyzSrv["Xiaoyuzhou Service<br/>(src/services/xiaoyuzhou.ts)"]
            GeminiSrv["Gemini Service<br/>(src/services/gemini.ts)"]
        end

        DB[("SQLite DB<br/>(better-sqlite3, /data/db/transcriptions.db)<br/>jobs · transcriptions · api_calls")]
        BiliCache[("Bilibili Cache<br/>(/data/bilibili-audio/*.m4a)<br/>90-day TTL")]
        SnipdCache[("Snipd Cache<br/>(/data/snipd-audio/*.mp3)<br/>90-day TTL")]
        XyzCache[("Xiaoyuzhou Cache<br/>(/data/xiaoyuzhou-audio/*.m4a)<br/>90-day TTL")]
        TempDisk[("Upload Temp<br/>(/tmp/*.m4a)")]

        Router -->|enqueue URL job| DB
        Router -->|"upload-transcribe (synchronous)"| GeminiSrv
        Worker -->|"claim, update & save"| DB
        Worker -->|bilibili URL| BiliSrv
        Worker -->|snipd URL| SnipdSrv
        Worker -->|xiaoyuzhou URL| XyzSrv
        Worker -->|transcribe via fallback chain| GeminiSrv
        BiliSrv -->|Cache miss/hit| BiliCache
        SnipdSrv -->|Cache miss/hit| SnipdCache
        XyzSrv -->|Cache miss/hit| XyzCache
        GeminiSrv -->|Read audio| BiliCache
        GeminiSrv -->|Read audio| SnipdCache
        GeminiSrv -->|Read audio| XyzCache
        GeminiSrv -->|Read & delete| TempDisk
    end

    subgraph External ["External Services"]
        direction TB
        BiliAPI["Bilibili APIs<br/>(view / playurl / CDN)"]
        SnipdAPI["Snipd GraphQL API<br/>(api.snipd.com)"]
        XyzPage["Xiaoyuzhou<br/>(episode page + xyzcdn.net CDN)"]
        GeminiAPI["Google Gemini API<br/>(File Upload / ASR)"]
    end

    %% Client Interactions
    Web -->|POST /api/transcribe| Router
    BrowserUI -->|"POST /api/jobs · /api/upload-transcribe<br/>GET /api/jobs · /api/transcriptions"| Router
    CLI -->|POST /api/transcribe| Router
    cURL -->|POST /api/transcribe| Router
    Router -.->|"SSE stream<br/>(downloading, uploading, transcribing, done, error)"| Web
    Router -.->|"SSE + JSON polling<br/>(queue status · history)"| BrowserUI
    Router -.->|"SSE stream<br/>(downloading, uploading, transcribing, done, error)"| CLI
    Router -.->|"Serves index.html (GET /)"| BrowserUI

    %% External API Connections
    BiliSrv <-->|Fetch metadata & DASH stream| BiliAPI
    SnipdSrv <-->|GraphQL query + MP3 download| SnipdAPI
    XyzSrv <-->|Parse __NEXT_DATA__ + M4A download| XyzPage
    GeminiSrv <-->|Upload & ASR| GeminiAPI

    %% Node Styles
    classDef client stroke:#3b82f6,stroke-width:1.5px;
    classDef b站 stroke:#db2777,stroke-width:1.5px;
    classDef snipd stroke:#f59e0b,stroke-width:1.5px;
    classDef xyz stroke:#10b981,stroke-width:1.5px;
    classDef gemini stroke:#4285f4,stroke-width:1.5px;
    classDef router stroke:#6366f1,stroke-width:1.5px;
    classDef storage stroke:#9ca3af,stroke-width:1.5px;

    class Web,BrowserUI,CLI,cURL client;
    class BiliSrv,BiliAPI b站;
    class SnipdSrv,SnipdAPI snipd;
    class XyzSrv,XyzPage xyz;
    class GeminiSrv,GeminiAPI gemini;
    class Router,Worker router;
    class BiliCache,SnipdCache,XyzCache,TempDisk,DB storage;
```

---

## Component Overviews

### 1. Clients & Integration Layer
* **Built-in Browser UI (`public/index.html`)**: A single-page interface served directly by Express at `GET /`. Supports Bilibili/Snipd/Xiaoyuzhou URL input and `.m4a` file upload (drag-and-drop). URL submissions are enqueued and tracked in a live **Queue** panel (per-job stage/progress, with cancel and retry); finished runs land in a persistent **History** table offering copy-transcript and delete actions. File uploads stream real-time SSE progress into an output panel with a one-click copy. Transcripts are timestamped plain text (`[MM:SS] Speaker: text`). No installation required — open `http://<host>:3001` in any browser.
* **React Web UI (`bilibili-copilot-web`)**: The downstream application that calls the service over a Tailscale connection and integrates transcription as a subtitle fallback.
* **CLI Scripts**: Helper scripts included in the repository (`test.sh` for Bilibili URLs and `transcribe-file.sh` for local files) that make raw curl requests and format the Server-Sent Events output.
* **cURL/REST API**: Direct HTTP API access for testing and integrations.

### 2. Audio Trainscript Service (Express Server)
* **Express API Server (`src/index.ts`)**:
  * Manages routing, file uploads (`multer` middleware), and HTTP connection lifecycles.
  * Streams real-time progress events back to clients as **Server-Sent Events (SSE)**.
  * Detects client disconnections to terminate long-running processes early.
  * Exposes the queue and history APIs (see the endpoint table below).
* **Queue Worker (`src/queue/worker.ts`)**:
  * A single background worker started at boot that drains the FIFO job queue.
  * For each job, downloads via the matching source service and transcribes through the model fallback chain, persisting the result to the History table.
  * Re-queues any job left in `processing` at startup (crash recovery).
* **SQLite Store (`src/db.ts`)**:
  * A `better-sqlite3` database at `/data/db/transcriptions.db` (volume `transcriptions-db`, overridable via `DB_PATH`).
  * Holds the `jobs` queue, completed `transcriptions` (the History list), and `api_calls` used to enforce per-model RPM/RPD limits.
* **Bilibili Service (`src/services/bilibili.ts`)**:
  * Resolves `b23.tv` short URLs to canonical `bilibili.com` URLs before any processing.
  * Extracts the Bilibili Video ID (`BVID`).
  * Interacts with Bilibili APIs to resolve metadata (`cid`) and stream playurls.
  * Downloads the DASH audio stream chunk-by-chunk using Axios.
* **Snipd Service (`src/services/snipd.ts`)**:
  * Extracts the episode UUID from a `share.snipd.com/episode/` URL.
  * Queries the Snipd GraphQL API for the episode's audio URL and metadata.
  * Downloads the MP3 stream with a 500 MB size limit.
* **Xiaoyuzhou Service (`src/services/xiaoyuzhou.ts`)**:
  * Extracts the 24-character hex episode ID from a `xiaoyuzhoufm.com/episode/` URL.
  * Fetches the public episode page and parses the `__NEXT_DATA__` JSON block to obtain the audio URL and metadata — no API token required.
  * Downloads the M4A stream from the public `xyzcdn.net` CDN with a 500 MB size limit.
* **Gemini Service (`src/services/gemini.ts`)**:
  * Authenticates using `GEMINI_API_KEY` and initializes the `@google/genai` client.
  * Uploads audio files to the Google AI Studio Files API.
  * Polls the file processing status until it is ready (`PROCESSING` -> `ACTIVE`).
  * Invokes the Gemini API `generateContent` with a prompt embedding episode metadata (title, speaker, description) for context-aware ASR.
  * Returns the transcript verbatim and cleans up the uploaded file from Google AI Studio on completion.
  * Scans and cleans up orphaned Gemini files older than 1 hour on startup.
* **Audio Caches** (`/data/bilibili-audio/`, `/data/snipd-audio/`, `/data/xiaoyuzhou-audio/`):
  * Each source has its own persistent named Docker volume. Files are keyed by episode/video ID with a 90-day sliding TTL — a cache hit refreshes mtime and skips the download entirely.
* **Upload Temp** (`/tmp/`):
  * Temporary directory used exclusively to stage `.m4a` files uploaded by clients via `/api/upload-transcribe`. Cleaned up immediately after transcription or on error.

### 3. External API Dependencies
* **Bilibili APIs**: Used to resolve stream URLs and download audio. Requires `BILIBILI_SESSION_TOKEN` (the `SESSDATA` cookie) for authenticated request access.
* **Snipd GraphQL API** (`api.snipd.com`): Queried with the episode UUID to fetch the MP3 audio URL and metadata. No authentication required.
* **Xiaoyuzhou Episode Page + CDN** (`xiaoyuzhoufm.com` / `xyzcdn.net`): The public episode page embeds full episode JSON in a `__NEXT_DATA__` block; the CDN serves M4A audio publicly. No authentication required.
* **Google Gemini API / AI Studio**: Receives audio uploads and performs ASR (Automated Speech Recognition) using the configurable model fallback chain in `config/rate-limits.json` (first choice `gemini-3.1-flash-lite`).

### API Endpoints

| Method   | Path                        | Purpose |
|----------|-----------------------------|---------|
| `GET`    | `/`                         | Serves the built-in browser UI (`public/index.html`). |
| `GET`    | `/health`                   | Health check — returns `{ "status": "ok" }`. |
| `POST`   | `/api/jobs`                 | Enqueue a URL transcription job; returns `{ id, status: "queued" }`. |
| `GET`    | `/api/jobs`                 | List active/failed jobs for the Queue panel (completed jobs excluded). |
| `DELETE` | `/api/jobs/:id`             | Cancel a queued job or dismiss a failed one. |
| `POST`   | `/api/transcribe`           | Backward-compatible SSE endpoint — enqueues a URL job and tails its progress as SSE. |
| `POST`   | `/api/upload-transcribe`    | Transcribe an uploaded `.m4a` synchronously over SSE (not queued, not persisted). |
| `GET`    | `/api/transcriptions`       | List completed transcriptions (the History table). |
| `DELETE` | `/api/transcriptions/:id`   | Delete a completed transcription. |

SSE events emitted by the streaming endpoints: `downloading` (with `progress`), `uploading`, `transcribing`, `done` (with `text`), and `error`.

### Rate limits

URL transcriptions run through an asynchronous queue drained by a single worker, which is the only component that calls Gemini. Per-model requests-per-minute (RPM) and requests-per-day (RPD) limits are read from [`config/rate-limits.json`](./config/rate-limits.json) — edit `default` and per-model `models` entries to match your Gemini quota. The file is read once at startup, so restart the service after editing. Override the path with `RATE_LIMITS_PATH` if needed.

Every job is transcribed by walking the ordered `fallback` chain in the same config: the worker uses the first chain model that has quota, skips a capped model (waiting only when the whole chain is capped), and steps down to the next model on a transient provider error. There is no per-job model selection — order the chain best-first.

---

## Detailed Usage Instructions

For local installation, Docker deployment, API formats, and testing scripts, please refer to the **[USAGE.md](./USAGE.md)** guide.
