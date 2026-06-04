## ADDED Requirements

### Requirement: Audio files are cached by bvid
The system SHALL store downloaded Bilibili audio files on disk keyed by `bvid`, so that subsequent requests for the same video skip the download step.

#### Scenario: Cache hit — file exists and is fresh
- **WHEN** a `/api/transcribe` request arrives for a `bvid` whose audio file exists at `/data/bilibili-audio/<bvid>.m4a` and the file's `mtime` is less than 90 days ago
- **THEN** the system SHALL use the cached file directly without contacting Bilibili CDN, and SHALL NOT emit any `downloading` SSE events

#### Scenario: Cache miss — file does not exist
- **WHEN** a `/api/transcribe` request arrives for a `bvid` whose audio file does not exist in the cache directory
- **THEN** the system SHALL download the audio from Bilibili CDN, write it to `/data/bilibili-audio/<bvid>.m4a`, and emit `downloading` progress events as normal

#### Scenario: Cache miss — file is stale
- **WHEN** a `/api/transcribe` request arrives for a `bvid` whose cached file's `mtime` is 90 days or older
- **THEN** the system SHALL re-download the audio from Bilibili CDN, overwrite the existing cached file, and emit `downloading` progress events as normal

### Requirement: Cached files are not deleted after transcription
The system SHALL NOT delete the cached audio file after transcription completes or fails.

#### Scenario: Transcription succeeds
- **WHEN** transcription of a cached audio file completes successfully
- **THEN** the file at `/data/bilibili-audio/<bvid>.m4a` SHALL still exist on disk

#### Scenario: Transcription fails
- **WHEN** transcription of a cached audio file fails with an error
- **THEN** the file at `/data/bilibili-audio/<bvid>.m4a` SHALL still exist on disk

### Requirement: Cache is backed by a named Docker volume
The system SHALL mount the cache directory from a named Docker volume so that cached files persist across container restarts.

#### Scenario: Container restart
- **WHEN** the Docker container is stopped and restarted
- **THEN** previously cached audio files SHALL still be available at `/data/bilibili-audio/`

### Requirement: Upload-transcribe endpoint is unaffected
The `/api/upload-transcribe` endpoint SHALL continue to use ephemeral temp files that are deleted after transcription.

#### Scenario: Upload transcription cleanup
- **WHEN** `/api/upload-transcribe` completes or fails
- **THEN** the temporary upload file SHALL be deleted from `os.tmpdir()`
