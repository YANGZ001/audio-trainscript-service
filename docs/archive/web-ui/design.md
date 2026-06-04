# Web UI — Design

## Core Flow

```
Browser (index.html)
  │
  ├─ URL tab: POST /api/transcribe           { type, url }  + ?model=
  └─ File tab: POST /api/upload-transcribe   multipart file + ?model=
          │
          │  SSE stream
          ▼
  event: downloading  { progress: 0-100 }
  event: uploading    {}
  event: transcribing {}
  event: done         [ { from, to, content }, ... ]   ← joined to plain text in browser
  event: error        { error: "..." }
```

## API Design

No new API endpoints. The UI calls the two existing endpoints:

| Method | Path | Body |
|--------|------|------|
| POST | `/api/transcribe?model=<id>` | `{ "type": "bilibili", "url": "..." }` |
| POST | `/api/upload-transcribe?model=<id>` | multipart `file` field (.m4a) |

## Frontend State

State lives in plain JS variables in `public/index.html` (no framework):

| Variable | Type | Purpose |
|---|---|---|
| `activeTab` | `'url' \| 'file'` | Which input panel is visible |
| `selectedFile` | `File \| null` | File chosen via picker or drag-and-drop |
| `abortController` | `AbortController \| null` | Cancels in-flight fetch on re-submit |

## SSE Parsing

`EventSource` is GET-only. The UI uses `fetch()` with `response.body.getReader()` and a manual SSE parser that splits on `\n\n`, extracts `event:` and `data:` fields from each block.

## Segment → Text Conversion (client-side)

```js
const text = segments.map(s => s.content).join('\n');
```

No backend change required. The `done` event payload remains `Segment[]`.

## Directory Changes

```
audio-trainscript-service/
  public/
    index.html        ← new: single-file UI
  src/
    index.ts          ← +1 line: express.static middleware
  Dockerfile          ← +1 line: COPY public/ ./public/
  docs/
    web-ui/           ← new feature docs (this folder)
```

## Storage Rationale

No storage. The transcript is rendered in a read-only `<textarea>` and the user copies it manually. This avoids any persistence concerns for the initial version.
