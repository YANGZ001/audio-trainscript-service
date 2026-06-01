# Model Selection — Design

## API Change

Both endpoints accept an optional `model` query parameter:

```
POST /api/transcribe?model=gemini-2.5-flash
POST /api/upload-transcribe?model=gemini-2.5-flash
```

- If omitted, the server defaults to `gemini-3.1-flash-lite`.
- The value is passed directly to the Gemini SDK; no server-side validation.

### Why query parameter (not request body)?

`/api/upload-transcribe` uses `multipart/form-data`, while `/api/transcribe` uses JSON. A query parameter works uniformly for both without changing either body schema.

## `transcribeAudio` Signature Change

```typescript
// Before
export async function transcribeAudio(
  filePath: string,
  onTranscribing: () => void,
): Promise<Segment[]>

// After
export async function transcribeAudio(
  filePath: string,
  onTranscribing: () => void,
  model?: string,           // falls back to GEMINI_MODEL constant
): Promise<Segment[]>
```

Inside the function, `GEMINI_MODEL` is replaced with `model ?? GEMINI_MODEL`.

## Shell Script Pattern

Both `test.sh` and `transcribe-file.sh` read a `MODEL` env var:

```bash
MODEL="${MODEL:-}"
endpoint="$HOST/api/..."
[[ -n "$MODEL" ]] && endpoint="${endpoint}?model=${MODEL}"
```

Usage:
```bash
MODEL=gemini-2.5-flash ./transcribe-file.sh interview.m4a
```

## Directory Changes

| File | Change |
|---|---|
| `src/services/gemini.ts` | Add `model?` param; use `model ?? GEMINI_MODEL` |
| `src/index.ts` | Extract `req.query.model`; pass to both `transcribeAudio` calls |
| `test.sh` | Add `MODEL` env var; append `?model=` when set |
| `transcribe-file.sh` | Add `MODEL` env var; append `?model=` when set |
| `USAGE.md` | Add model selection section |
| `docs/model-selection/` | This feature doc |
