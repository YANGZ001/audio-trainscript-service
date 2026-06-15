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

        subgraph Internal ["Source Services"]
            direction LR
            BiliSrv["Bilibili Service<br/>(src/services/bilibili.ts)"]
            SnipdSrv["Snipd Service<br/>(src/services/snipd.ts)"]
            XyzSrv["Xiaoyuzhou Service<br/>(src/services/xiaoyuzhou.ts)"]
            GeminiSrv["Gemini Service<br/>(src/services/gemini.ts)"]
        end

        BiliCache[("Bilibili Cache<br/>(/data/bilibili-audio/*.m4a)<br/>90-day TTL")]
        SnipdCache[("Snipd Cache<br/>(/data/snipd-audio/*.mp3)<br/>90-day TTL")]
        XyzCache[("Xiaoyuzhou Cache<br/>(/data/xiaoyuzhou-audio/*.m4a)<br/>90-day TTL")]
        TempDisk[("Upload Temp<br/>(/tmp/*.m4a)")]

        Router -->|bilibili URL| BiliSrv
        Router -->|snipd URL| SnipdSrv
        Router -->|xiaoyuzhou URL| XyzSrv
        Router -->|Transcribe| GeminiSrv
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
    BrowserUI -->|"POST /api/transcribe<br/>POST /api/upload-transcribe"| Router
    CLI -->|POST /api/transcribe| Router
    cURL -->|POST /api/transcribe| Router
    Router -.->|"SSE stream<br/>(downloading, uploading, transcribing, done)"| Web
    Router -.->|"SSE stream<br/>(downloading, uploading, transcribing, done)"| BrowserUI
    Router -.->|"SSE stream<br/>(downloading, uploading, transcribing, done)"| CLI
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
    class Router router;
    class BiliCache,SnipdCache,XyzCache,TempDisk storage;
```

---

## Component Overviews

### 1. Clients & Integration Layer
* **Built-in Browser UI (`public/index.html`)**: A single-page interface served directly by Express at `GET /`. Supports Bilibili URL input and `.m4a` file upload (drag-and-drop), displays real-time SSE progress, and outputs the transcript as timestamped plain text with a one-click copy action. No installation required — open `http://<host>:3001` in any browser.
* **React Web UI (`bilibili-copilot-web`)**: The downstream application that calls the service over a Tailscale connection and integrates transcription as a subtitle fallback.
* **CLI Scripts**: Helper scripts included in the repository (`test.sh` for Bilibili URLs and `transcribe-file.sh` for local files) that make raw curl requests and format the Server-Sent Events output.
* **cURL/REST API**: Direct HTTP API access for testing and integrations.

### 2. Audio Trainscript Service (Express Server)
* **Express API Server (`src/index.ts`)**:
  * Manages routing, file uploads (`multer` middleware), and HTTP connection lifecycles.
  * Streams real-time progress events back to clients as **Server-Sent Events (SSE)**.
  * Detects client disconnections to terminate long-running processes early.
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
* **Google Gemini API / AI Studio**: Receives audio uploads and performs ASR (Automated Speech Recognition) utilizing models such as `gemini-2.5-flash-lite`.

### Rate limits

URL transcriptions run through an asynchronous queue drained by a single worker, which is the only component that calls Gemini. Per-model requests-per-minute (RPM) and requests-per-day (RPD) limits are read from [`config/rate-limits.json`](./config/rate-limits.json) — edit `default` and per-model `models` entries to match your Gemini quota. Override the path with `RATE_LIMITS_PATH` if needed.

---

## Detailed Usage Instructions

For local installation, Docker deployment, API formats, and testing scripts, please refer to the **[USAGE.md](./USAGE.md)** guide.
