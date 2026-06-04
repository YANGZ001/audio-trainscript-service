# Design: Raw Transcript Passthrough

## Core Flow

```
Client                      Service                        Gemini
  |                            |                              |
  |-- POST /api/transcribe --> |                              |
  |                            |-- upload audio file -------> |
  |<-- event: uploading -------|                              |
  |                            |<-- file URI ---------------- |
  |<-- event: transcribing ----|-- generateContent() -------> |
  |                            |<-- raw text string --------- |
  |<-- event: done ------------|  (no parsing, no repair)     |
  |     data: { text: "..." }  |                              |
```

Both endpoints (`/api/transcribe` and `/api/upload-transcribe`) follow the same flow.

## API Design

### SSE Events (unchanged)

| Event | Data | Change |
|---|---|---|
| `downloading` | `{ progress: number }` | none |
| `uploading` | `{}` | none |
| `transcribing` | `{}` | none |
| `error` | `{ error: string }` | none |
| `done` | `{ text: string }` | **changed** (was `Segment[]`) |

The `done` event payload changes from a JSON array of segments to a plain object with a single `text` field containing Gemini's raw output string.

### Example `done` payload (before)

```json
[
  { "from": 0.089, "to": 2.149, "content": "Hey guys, welcome back." },
  { "from": 2.149, "to": 4.269, "content": "Today we're talking about studying." }
]
```

### Example `done` payload (after)

```json
{
  "text": "[{\"from\":0.089,\"to\":2.149,\"content\":\"Hey guys, welcome back.\"}, {\"from\":2.149,\"to\":4.269,\"content\":\"Today we're talking about studying.\"}]"
}
```

The text content is whatever Gemini returns — typically JSON-ish with timestamps, but not guaranteed to be parse-valid.

## Data Model

### Before: `Segment` type (deleted)

```typescript
type Segment = { from: number; to: number; content: string };
```

This type and all downstream references are removed.

### After: `transcribeAudio` return type

```typescript
// Before
async function transcribeAudio(...): Promise<Segment[]>

// After
async function transcribeAudio(...): Promise<string>
```

## What Is Deleted

From `gemini.ts`:
- `Segment` type export
- Repair 1–5 regex passes
- `JSON.parse()` call and fallback array-extraction logic
- Malformed-segment filtering (`malformed.length > 0` path)
- The `[WARN] parse error` log path

From `index.ts`:
- `transcript.length` segment count log (replaced with `text.length` char count)
- Import of `Segment` type (if explicitly imported)

## Frontend State

The web UI (`public/index.html`) reads the `done` event payload in `handleEvent()`. Currently it treats the payload as a `Segment[]` array and joins it:

```javascript
// current
const segments = Array.isArray(payload) ? payload : [];
const text = segments.map(s => '[' + formatTime(s.from) + '] ' + s.content).join('\n');
```

After this change, `payload` is `{ text: string }`. The handler must be updated to read `payload.text` directly:

```javascript
// after
const text = typeof payload.text === 'string' ? payload.text : '';
```

The `formatTime` helper and the `segments` count display (`N segments`) are removed from the success path. Character count display remains (`text.length` chars).

## Directory Changes

| File | Change |
|---|---|
| `src/services/gemini.ts` | Remove `Segment` type, repair pipeline, JSON parsing; return `string` |
| `src/index.ts` | Update `done` event payload; update log message |
| `public/index.html` | Update `handleEvent` to read `payload.text`; remove segment-join and `formatTime` usage |
| `USAGE.md` | Update `done` payload example and field description |
