# Spec: snipd-episode-transcription

## Purpose

Defines how the service transcribes Snipd podcast episodes submitted via share URL. The service auto-detects the Snipd source from the URL, fetches episode metadata and audio URL via the Snipd GraphQL API, downloads the MP3 (with caching), and transcribes it via the existing Gemini pipeline.

---

## Requirements

### Requirement: Source is auto-detected from the URL
The system SHALL infer the audio source from the submitted URL without requiring a `type` field. The request body SHALL contain only `{ "url": "..." }`.

#### Scenario: Snipd episode URL submitted
- **WHEN** a client sends `POST /api/transcribe` with `{ "url": "https://share.snipd.com/episode/<uuid>" }`
- **THEN** the system SHALL route to the Snipd source module and respond with an SSE stream

#### Scenario: Bilibili URL submitted
- **WHEN** a client sends `POST /api/transcribe` with a `bilibili.com` or `b23.tv` URL
- **THEN** the system SHALL route to the Bilibili source module (unchanged behaviour)

#### Scenario: Unrecognised URL submitted
- **WHEN** a client sends `POST /api/transcribe` with a URL that does not match any known source pattern
- **THEN** the system SHALL respond with HTTP 400 and a message identifying the URL as unsupported

### Requirement: Episode data is fetched via the Snipd GraphQL API
The system SHALL fetch episode metadata and audio URL by querying the Snipd public GraphQL API (`https://api.snipd.com/v1/public/graphql`) using the episode UUID extracted from the share URL.

#### Scenario: Episode found
- **WHEN** the GraphQL query `episodes_by_pk(id: $id)` returns a valid episode with an `audio_url`
- **THEN** the system SHALL extract the MP3 URL and proceed to download

#### Scenario: Episode not found
- **WHEN** the GraphQL query returns a null episode
- **THEN** the system SHALL emit an SSE `error` event with a message indicating the episode was not found

#### Scenario: API error
- **WHEN** the GraphQL response contains an `errors` array
- **THEN** the system SHALL emit an SSE `error` event with the first error message

### Requirement: Episode metadata is injected into the transcription prompt
The system SHALL pass available episode metadata to the Gemini prompt: podcast name (as `ownerName`), episode title, description, and duration in seconds.

#### Scenario: All metadata fields present
- **WHEN** the Snipd API returns title, show title, description, and duration
- **THEN** the Gemini prompt SHALL include all four fields

#### Scenario: Partial metadata
- **WHEN** one or more metadata fields are absent from the API response
- **THEN** the system SHALL omit those fields from the prompt without error

### Requirement: Snipd episode audio is downloaded and cached
The system SHALL download the podcast MP3 and write it to `/data/snipd-audio/<uuid>.mp3`, following the same 90-day TTL caching policy defined in the `audio-file-cache` spec.

#### Scenario: Cache miss — episode not yet downloaded
- **WHEN** `/data/snipd-audio/<uuid>.mp3` does not exist or is stale
- **THEN** the system SHALL download the MP3 and emit `downloading` progress SSE events

#### Scenario: Cache hit — episode already downloaded
- **WHEN** `/data/snipd-audio/<uuid>.mp3` exists and its `mtime` is less than 90 days ago
- **THEN** the system SHALL use the cached file and SHALL NOT emit `downloading` events

### Requirement: Snipd audio download is size-limited
The system SHALL reject audio downloads that exceed 500 MB.

#### Scenario: Download exceeds 500 MB
- **WHEN** the podcast MP3 content-length header or streamed bytes exceed 500 MB
- **THEN** the system SHALL abort the download and emit an SSE `error` event
