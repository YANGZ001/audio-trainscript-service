# Model Selection — Test Plan

## Manual Tests

### 1. Default model (regression)
```bash
./transcribe-file.sh interview.m4a
```
Expected: transcript streams back as before; no behaviour change.

### 2. Explicit valid model
```bash
MODEL=gemini-2.5-flash ./transcribe-file.sh interview.m4a
```
Expected: request hits `/api/upload-transcribe?model=gemini-2.5-flash`; transcript returned successfully.

### 3. Invalid model name
```bash
MODEL=not-a-real-model ./transcribe-file.sh interview.m4a
```
Expected: `error` SSE event with a Gemini API error message; no server crash.

### 4. Bilibili endpoint with model
```bash
MODEL=gemini-2.5-flash ./test.sh 'https://www.bilibili.com/video/BV1heV86BEZv/'
```
Expected: transcript returned using `gemini-2.5-flash`.

### 5. Raw curl with model
```bash
curl -s --no-buffer -N \
  -F "file=@interview.m4a;type=audio/mp4" \
  http://zyfun-ubuntu26:3001/api/upload-transcribe?model=gemini-2.5-flash
```
Expected: SSE stream with transcript.

## Regression Checks

- `/health` endpoint still returns `{"status":"ok"}`.
- Omitting `?model=` on both endpoints produces correct transcripts (default model unchanged).
- File size and MIME type validation on `/api/upload-transcribe` still works independently of model param.
