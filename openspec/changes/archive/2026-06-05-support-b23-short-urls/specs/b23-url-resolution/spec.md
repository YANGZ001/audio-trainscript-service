## ADDED Requirements

### Requirement: Resolve b23.tv short URLs before BVID extraction
The service SHALL resolve `b23.tv` short URLs to their canonical `bilibili.com` URLs before attempting to extract the BVID, so that callers can pass either URL form to `POST /api/transcribe`.

#### Scenario: Short URL resolves successfully
- **WHEN** a `b23.tv` URL is submitted to `POST /api/transcribe`
- **THEN** the service follows the HTTP redirect to the canonical Bilibili URL and returns a transcription result identical to submitting the full URL directly

#### Scenario: Non-short URL is passed through unchanged
- **WHEN** a full `https://www.bilibili.com/video/BV…` URL is submitted
- **THEN** no redirect resolution is performed and the existing flow runs as-is

#### Scenario: Short URL redirect resolution fails (network error)
- **WHEN** the redirect resolution HTTP call errors (timeout, DNS failure, etc.)
- **THEN** the original URL is passed to `extractBvid`, which throws its existing error; the SSE stream sends an `error` event with the message

#### Scenario: Short URL returns non-redirect response
- **WHEN** the `b23.tv` URL returns a non-3xx response (e.g. 200 or 404)
- **THEN** the original URL is passed through to `extractBvid` unchanged

### Requirement: Short URL resolution completes within 5 seconds
The resolution HTTP call SHALL time out after 5 000 ms so it does not hold up the transcription pipeline indefinitely.

#### Scenario: Resolution exceeds timeout
- **WHEN** the `b23.tv` redirect endpoint does not respond within 5 s
- **THEN** the resolution call is aborted and the original URL is used as-is
