# Spec: audio-file-cache

## Purpose

Defines caching behaviour for audio files downloaded during transcription. Audio files are stored on disk so that repeated requests for the same content skip the download step. The cache is backed by named Docker volumes to survive container restarts.

---

## Requirements

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

### Requirement: Cached files are not deleted after transcription
The system SHALL NOT delete a cached audio file after transcription completes or fails.

#### Scenario: Bilibili transcription succeeds
- **WHEN** transcription of a cached Bilibili audio file completes successfully
- **THEN** the file at `/data/bilibili-audio/<bvid>.m4a` SHALL still exist on disk

#### Scenario: Bilibili transcription fails
- **WHEN** transcription of a cached Bilibili audio file fails with an error
- **THEN** the file at `/data/bilibili-audio/<bvid>.m4a` SHALL still exist on disk

#### Scenario: Snipd transcription succeeds
- **WHEN** transcription of a cached Snipd audio file completes successfully
- **THEN** the file at `/data/snipd-audio/<uuid>.mp3` SHALL still exist on disk

#### Scenario: Snipd transcription fails
- **WHEN** transcription of a cached Snipd audio file fails with an error
- **THEN** the file at `/data/snipd-audio/<uuid>.mp3` SHALL still exist on disk

### Requirement: Cache is backed by named Docker volumes
The system SHALL mount both cache directories from named Docker volumes so that cached files persist across container restarts.

#### Scenario: Container restart
- **WHEN** the Docker container is stopped and restarted
- **THEN** previously cached audio files SHALL still be available at `/data/bilibili-audio/` and `/data/snipd-audio/`

### Requirement: Upload-transcribe endpoint is unaffected
The `/api/upload-transcribe` endpoint SHALL continue to use ephemeral temp files that are deleted after transcription.

#### Scenario: Upload transcription cleanup
- **WHEN** `/api/upload-transcribe` completes or fails
- **THEN** the temporary upload file SHALL be deleted from `os.tmpdir()`
