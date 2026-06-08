## ADDED Requirements

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

### Requirement: Episode audio URL is extracted from the Snipd share page
The system SHALL fetch the Snipd share page and extract the underlying podcast MP3 URL from the embedded `__NEXT_DATA__` JSON.

#### Scenario: Page accessible and audio URL present
- **WHEN** the Snipd share page returns HTTP 200 and contains a `__NEXT_DATA__` script tag with a valid episode audio URL
- **THEN** the system SHALL extract the MP3 URL and proceed to download

#### Scenario: Page blocked by Cloudflare
- **WHEN** the Snipd share page returns HTTP 403 or a Cloudflare challenge response
- **THEN** the system SHALL emit an SSE `error` event with a human-readable message indicating the page could not be fetched

#### Scenario: Page structure changed
- **WHEN** the Snipd share page returns HTTP 200 but `__NEXT_DATA__` does not contain a recognisable audio URL field
- **THEN** the system SHALL emit an SSE `error` event describing which field was missing

### Requirement: Episode metadata is injected into the transcription prompt
The system SHALL pass available episode metadata to the Gemini prompt: podcast name (as `ownerName`), episode title, description (first 200 chars), duration in seconds, and podcast category.

#### Scenario: All metadata fields present
- **WHEN** the Snipd page contains title, podcast name, description, duration, and category
- **THEN** the Gemini prompt SHALL include all five fields

#### Scenario: Partial metadata
- **WHEN** one or more metadata fields are absent from the Snipd page
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
