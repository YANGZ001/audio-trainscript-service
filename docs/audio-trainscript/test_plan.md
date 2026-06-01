# Audio Trainscript Service — Test Plan

## Manual Test Scenarios (Active Scope)

### 1. Bilibili Audio Fallback Transcription (Golden Path)
- **Setup**: Select a Bilibili video known to have no subtitles.
- **Execution**: 
  - Send `POST http://localhost:port/api/transcribe` with `{ "type": "bilibili", "url": "video_url_here" }`.
- **Expected Results**:
  - SSE connection opens.
  - Receives progress stream (`downloading` $\rightarrow$ `uploading` $\rightarrow$ `transcribing`).
  - Finishes with a `done` event containing a valid timestamped JSON transcript.
  - Local `temp/` folder is empty and the uploaded file is removed from Gemini cloud files.

---

## Automated Test Scenarios

- **Bilibili URL Parser Unit Tests**: Verify extraction of BVID and page parameters.
- **Gemini Response Parsing**: Validate that Gemini output gets cleanly parsed into the array shape `[ { from: number, to: number, content: string } ]`.

---

## Future Todo Test Backlog

- **Google Drive Authentication & Downloader**: Test service account integration.
- **Multipart Upload Limit Validation**: Verify that uploads > 100MB are rejected, and uploads < 100MB are correctly streamed.
- **SQLite Database TTL Job**: Mock a record created 3 years ago and trigger the cleanup cron to verify deletion.
