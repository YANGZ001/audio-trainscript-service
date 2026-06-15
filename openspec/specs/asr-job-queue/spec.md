# Spec: asr-job-queue

## Purpose

Defines the asynchronous transcription job queue. URL transcriptions (Bilibili, Snipd, Xiaoyuzhou) are submitted to a persistent, SQLite-backed queue and drained by a single in-process worker in strict FIFO order — the only component that calls the transcription provider for queued jobs. Clients submit via `POST /api/jobs` and poll `GET /api/jobs`; completed transcripts appear in History. The legacy `POST /api/transcribe` SSE endpoint is preserved as a backward-compatible wrapper that enqueues a job and tails its progress.

---

## Requirements

### Requirement: Enqueue a transcription job

The system SHALL accept a transcription request for a supported URL source (Bilibili, Snipd, Xiaoyuzhou) via `POST /api/jobs` and persist it as a job, returning immediately without waiting for transcription.

#### Scenario: Valid URL enqueued

- **WHEN** a client sends `POST /api/jobs` with a body `{ "url": "<supported-url>" }`
- **THEN** the system persists a job with status `queued` and responds `201` with `{ "id": <number>, "status": "queued" }` before any download or transcription begins

#### Scenario: Optional model override

- **WHEN** the request body includes a `model` field
- **THEN** the job is persisted with that model and the worker uses it when transcribing

#### Scenario: Missing or invalid URL

- **WHEN** the request body has no `url` string
- **THEN** the system responds `400` with an error message and persists no job

#### Scenario: Unsupported URL source

- **WHEN** the `url` does not match a Bilibili, Snipd, or Xiaoyuzhou episode URL
- **THEN** the system responds `400` with an error message and persists no job

### Requirement: List active jobs

The system SHALL expose `GET /api/jobs` returning the in-flight (`queued`, `processing`) and `failed` jobs ordered most-recent first, including each job's status, stage, progress, error, and linked transcription id. Completed (`done`) jobs SHALL be excluded, since their transcript is available in History.

#### Scenario: Client polls job status

- **WHEN** a client sends `GET /api/jobs`
- **THEN** the system returns a JSON array of the queued, processing, and failed jobs, each containing at least `id`, `source_type`, `source_url`, `status`, `stage`, `progress`, `error`, and `transcription_id`

#### Scenario: Completed jobs are removed

- **WHEN** a job finishes successfully and its transcript is persisted
- **THEN** the job no longer appears in `GET /api/jobs`, and its row is pruned shortly after so the table does not grow unbounded

### Requirement: Remove a queued or failed job

The system SHALL allow removing a `queued` job (cancel) or a `failed` job (dismiss) via `DELETE /api/jobs/:id`, but SHALL NOT remove a job that is `processing`.

#### Scenario: Cancel a queued job

- **WHEN** a client sends `DELETE /api/jobs/:id` for a job whose status is `queued`
- **THEN** the job is removed from the queue and is no longer eligible for processing

#### Scenario: Dismiss a failed job

- **WHEN** a client sends `DELETE /api/jobs/:id` for a job whose status is `failed`
- **THEN** the job record is removed so it no longer appears in the queue listing

#### Scenario: Cannot remove a processing job

- **WHEN** a client sends `DELETE /api/jobs/:id` for a job whose status is `processing`
- **THEN** the system does not interrupt the in-flight job and responds with a conflict

### Requirement: Retry a failed job

The system SHALL allow the user to retry a `failed` job by re-enqueuing a new job with the same source URL and model.

#### Scenario: Retry re-enqueues the work

- **WHEN** the user retries a failed job
- **THEN** a new `queued` job is created with the original job's URL and model, and the original failed job is removed from the listing

### Requirement: FIFO single-worker processing

A single worker SHALL process queued jobs one at a time in strict first-in-first-out order (by submission time), and it SHALL be the only component that calls the transcription provider for queued jobs.

#### Scenario: Jobs processed in submission order

- **WHEN** multiple jobs are queued
- **THEN** the worker claims and processes them oldest-first, one at a time, never running two transcriptions concurrently

#### Scenario: Job lifecycle on success

- **WHEN** the worker finishes a job successfully
- **THEN** the job transitions `queued` → `processing` → `done`, the transcript is persisted to transcription history, and the job records the resulting transcription id

#### Scenario: Job lifecycle on failure

- **WHEN** transcription fails for a job with a permanent error, or after retries are exhausted
- **THEN** the job transitions to `failed` with a human-readable error message recorded, and the worker continues with the next job

#### Scenario: Transient failure is retried

- **WHEN** an attempt fails with a transient error (provider 429/5xx such as `UNAVAILABLE`, or a network error)
- **THEN** the worker retries the job (bounded attempts, exponential backoff) before marking it `failed`, and each retry is gated and counted against the rate limits

#### Scenario: Permanent failure is not retried

- **WHEN** an attempt fails with a permanent error (e.g. invalid URL, missing credentials, a 4xx response)
- **THEN** the worker marks the job `failed` immediately without retrying

### Requirement: Per-job progress reporting

The worker SHALL update a job's stage and download progress as it advances so clients polling `GET /api/jobs` can observe progress.

#### Scenario: Stage transitions are observable

- **WHEN** the worker downloads, uploads, then transcribes a job's audio
- **THEN** the job's `stage` reflects `downloading` (with a `progress` percentage), then `uploading`, then `transcribing`, visible to polling clients

### Requirement: Backward-compatible synchronous transcribe endpoint

`POST /api/transcribe` SHALL preserve its existing SSE contract while internally enqueuing a job and streaming that job's progress until completion, so existing consumers require no changes.

#### Scenario: Existing SSE consumer unchanged

- **WHEN** a client sends `POST /api/transcribe` with `{ "url": "<supported-url>" }`
- **THEN** the system enqueues a job and streams the same SSE events (`downloading` with progress, `uploading`, `transcribing`, then `done` with the transcript text) as before, or `error` on failure

#### Scenario: Client disconnects mid-stream

- **WHEN** the client closes the connection before the job completes
- **THEN** the worker continues processing the job to completion in the background

### Requirement: Queue survives restart

Jobs SHALL be persisted durably so that the queue and job history survive a service restart.

#### Scenario: Restart with pending jobs

- **WHEN** the service restarts while jobs are `queued`
- **THEN** those jobs remain `queued` after restart and the worker resumes processing them

#### Scenario: Restart with an interrupted job

- **WHEN** the service restarts while a job is `processing` (interrupted mid-run)
- **THEN** the worker resets that orphaned job back to `queued` at startup so it is processed again rather than being stuck forever
