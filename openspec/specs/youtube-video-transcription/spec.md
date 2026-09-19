# Spec: youtube-video-transcription

## Purpose

Defines the behaviour for transcribing public YouTube videos. The system accepts `youtube.com` / `youtu.be` URLs, extracts the video ID, fetches best-effort metadata via oEmbed, and passes the canonical watch URL directly to Gemini (no download or cache), persisting the result to history.

---

## Requirements

### Requirement: System accepts YouTube video URLs
The system SHALL detect `youtube.com` and `youtu.be` URLs as the `youtube` source in `detectSource()`. The unsupported-URL error message SHALL list YouTube among the supported sources.

#### Scenario: Watch URL is detected
- **WHEN** a transcription job is enqueued with `https://www.youtube.com/watch?v=cBLbDn5RJlw`
- **THEN** the system SHALL accept it with `source_type='youtube'`

#### Scenario: Unsupported URL is rejected
- **WHEN** a URL matching no supported source is submitted
- **THEN** the system SHALL reject it with an error message that lists YouTube among the supported sources

### Requirement: Video ID is extracted from URL
The system SHALL extract the 11-character YouTube video ID from `watch?v=`, `youtu.be/<id>`, `/shorts/<id>` and `/live/<id>` URL forms.

#### Scenario: Short link
- **WHEN** the URL is `https://youtu.be/cBLbDn5RJlw?t=10`
- **THEN** the extracted video ID SHALL be `cBLbDn5RJlw`

#### Scenario: URL without video ID throws
- **WHEN** the URL is a YouTube URL with no recognisable video ID (e.g. a channel page)
- **THEN** the system SHALL throw an error indicating the video ID could not be extracted

### Requirement: Metadata is fetched best-effort via oEmbed
The system SHALL fetch `https://www.youtube.com/oembed?url=<canonical url>&format=json` and map `title` to `TranscriptMeta.title` and `author_name` to `TranscriptMeta.ownerName`. If the request fails, the system SHALL log a warning and continue with empty metadata.

#### Scenario: oEmbed succeeds
- **WHEN** oEmbed returns title and author_name
- **THEN** the title SHALL be reported to the job and both fields SHALL be included in the transcription prompt

#### Scenario: oEmbed fails
- **WHEN** the oEmbed request errors or returns non-2xx
- **THEN** transcription SHALL still proceed without metadata

### Requirement: YouTube video is transcribed by Gemini directly from its URL
The system SHALL pass the canonical watch URL to Gemini as `fileData.fileUri` together with the standard transcription prompt, without downloading audio, caching it locally, or uploading a file to Gemini.

#### Scenario: Successful transcription
- **WHEN** a public YouTube video URL is processed
- **THEN** the job SHALL go to the `transcribing` stage and complete with a transcript in `[MM:SS] Speaker: text` format

#### Scenario: Gemini cannot access video
- **WHEN** Gemini rejects the URL (e.g. private video)
- **THEN** the job SHALL fail with the Gemini error message

### Requirement: YouTube transcriptions are persisted to history
Completed YouTube transcriptions SHALL be upserted into history with `source_type='youtube'` and `content_id=<video id>`.

#### Scenario: First YouTube transcription saved
- **WHEN** a YouTube transcription completes for a video ID not yet in history
- **THEN** a row SHALL be inserted with `source_type='youtube'`, `content_id=<video id>`, and the oEmbed title/owner if available
