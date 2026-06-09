## ADDED Requirements

### Requirement: Xiaoyuzhou audio files are cached by episode ID
The system SHALL store downloaded Xiaoyuzhou podcast M4A files on disk keyed by the 24-character hex episode ID, so that subsequent requests for the same episode skip the download step.

#### Scenario: Cache hit — Xiaoyuzhou file exists and is fresh
- **WHEN** a `/api/transcribe` request arrives for a Xiaoyuzhou episode ID whose audio file exists at `/data/xiaoyuzhou-audio/<id>.m4a` and the file's `mtime` is less than 90 days ago
- **THEN** the system SHALL use the cached file directly without downloading the M4A, and SHALL NOT emit any `downloading` SSE events

#### Scenario: Cache miss — Xiaoyuzhou file does not exist
- **WHEN** a `/api/transcribe` request arrives for a Xiaoyuzhou episode ID whose audio file does not exist in `/data/xiaoyuzhou-audio/`
- **THEN** the system SHALL fetch the episode page, parse the audio URL, download the M4A to `/data/xiaoyuzhou-audio/<id>.m4a`, and emit `downloading` progress events

#### Scenario: Cache miss — Xiaoyuzhou file is stale
- **WHEN** a `/api/transcribe` request arrives for a Xiaoyuzhou episode ID whose cached file's `mtime` is 90 days or older
- **THEN** the system SHALL re-download the M4A, overwrite the existing cached file, and emit `downloading` progress events

#### Scenario: Xiaoyuzhou transcription succeeds
- **WHEN** transcription of a cached Xiaoyuzhou audio file completes successfully
- **THEN** the file at `/data/xiaoyuzhou-audio/<id>.m4a` SHALL still exist on disk

#### Scenario: Xiaoyuzhou transcription fails
- **WHEN** transcription of a cached Xiaoyuzhou audio file fails with an error
- **THEN** the file at `/data/xiaoyuzhou-audio/<id>.m4a` SHALL still exist on disk

### Requirement: Xiaoyuzhou cache is backed by a named Docker volume
The system SHALL mount `/data/xiaoyuzhou-audio/` from a named Docker volume (`xiaoyuzhou-audio-cache`) so that cached Xiaoyuzhou files persist across container restarts.

#### Scenario: Container restart with cached Xiaoyuzhou episodes
- **WHEN** the Docker container is stopped and restarted
- **THEN** previously cached Xiaoyuzhou audio files SHALL still be available at `/data/xiaoyuzhou-audio/`
