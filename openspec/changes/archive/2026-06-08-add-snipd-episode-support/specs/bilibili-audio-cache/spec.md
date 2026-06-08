## RENAMED Requirements

### Requirement: Audio files are cached by bvid
FROM: `bilibili-audio-cache`
TO: `audio-file-cache`

The scope of this capability is generalised from Bilibili-only to all audio sources. Existing Bilibili caching behaviour is unchanged. The spec is renamed to reflect that any audio source (Bilibili, Snipd, and future sources) follows the same caching policy.

## ADDED Requirements

### Requirement: Snipd audio files are cached by episode UUID
The system SHALL store downloaded Snipd podcast MP3 files on disk keyed by episode UUID, so that subsequent requests for the same episode skip the download step.

#### Scenario: Cache hit — Snipd file exists and is fresh
- **WHEN** a `/api/transcribe` request arrives for a Snipd episode UUID whose audio file exists at `/data/snipd-audio/<uuid>.mp3` and the file's `mtime` is less than 90 days ago
- **THEN** the system SHALL use the cached file directly without downloading the MP3, and SHALL NOT emit any `downloading` SSE events

#### Scenario: Cache miss — Snipd file does not exist
- **WHEN** a `/api/transcribe` request arrives for a Snipd episode UUID whose audio file does not exist in `/data/snipd-audio/`
- **THEN** the system SHALL download the MP3 from the URL extracted from the Snipd share page, write it to `/data/snipd-audio/<uuid>.mp3`, and emit `downloading` progress events

#### Scenario: Cache miss — Snipd file is stale
- **WHEN** a `/api/transcribe` request arrives for a Snipd episode UUID whose cached file's `mtime` is 90 days or older
- **THEN** the system SHALL re-download the MP3, overwrite the existing cached file, and emit `downloading` progress events

### Requirement: Snipd cache is backed by a named Docker volume
The system SHALL mount `/data/snipd-audio/` from a named Docker volume (`snipd-audio-cache`) so that cached Snipd files persist across container restarts.

#### Scenario: Container restart with cached Snipd episodes
- **WHEN** the Docker container is stopped and restarted
- **THEN** previously cached Snipd audio files SHALL still be available at `/data/snipd-audio/`

### Requirement: Snipd cached files are not deleted after transcription
The system SHALL NOT delete a cached Snipd audio file after transcription completes or fails.

#### Scenario: Snipd transcription succeeds
- **WHEN** transcription of a cached Snipd audio file completes successfully
- **THEN** the file at `/data/snipd-audio/<uuid>.mp3` SHALL still exist on disk

#### Scenario: Snipd transcription fails
- **WHEN** transcription of a cached Snipd audio file fails with an error
- **THEN** the file at `/data/snipd-audio/<uuid>.mp3` SHALL still exist on disk
