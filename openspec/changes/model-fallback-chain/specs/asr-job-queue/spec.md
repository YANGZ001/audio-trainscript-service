## MODIFIED Requirements

### Requirement: Enqueue a transcription job

The system SHALL accept a transcription request for a supported URL source (Bilibili, Snipd, Xiaoyuzhou) via `POST /api/jobs` and persist it as a job, returning immediately without waiting for transcription. The request body SHALL contain only `{ "url": "..." }`; there is no per-job model selection.

#### Scenario: Valid URL enqueued

- **WHEN** a client sends `POST /api/jobs` with a body `{ "url": "<supported-url>" }`
- **THEN** the system persists a job with status `queued` and responds `201` with `{ "id": <number>, "status": "queued" }` before any download or transcription begins

#### Scenario: Missing or invalid URL

- **WHEN** the request body has no `url` string
- **THEN** the system responds `400` with an error message and persists no job

#### Scenario: Unsupported URL source

- **WHEN** the `url` does not match a Bilibili, Snipd, or Xiaoyuzhou episode URL
- **THEN** the system responds `400` with an error message and persists no job

### Requirement: Retry a failed job

The system SHALL allow the user to retry a `failed` job by re-enqueuing a new job with the same source URL.

#### Scenario: Retry re-enqueues the work

- **WHEN** the user retries a failed job
- **THEN** a new `queued` job is created with the original job's URL, and the original failed job is removed from the listing
