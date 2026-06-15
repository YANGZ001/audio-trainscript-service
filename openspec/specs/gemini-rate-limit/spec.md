# Spec: gemini-rate-limit

## Purpose

Defines how the transcription worker enforces the provider's per-model rate limits. Requests-per-minute (RPM) and requests-per-day (RPD) limits are read from a config file; the single worker blocks before dispatching a request that would exceed a model's limits, using a durable request ledger so accounting survives restarts.

---

## Requirements

### Requirement: Per-model rate limits from config

The system SHALL read per-model requests-per-minute (RPM) and requests-per-day (RPD) limits from a config file, falling back to a default entry when a model is not listed.

#### Scenario: Model-specific limit applied

- **WHEN** the config defines `{ "rpm": N, "rpd": M }` for a model and a job uses that model
- **THEN** the worker enforces that model's RPM and RPD

#### Scenario: Unlisted model falls back to default

- **WHEN** a job uses a model not present in the config
- **THEN** the worker enforces the config's `default` RPM and RPD

### Requirement: Worker blocks until a request slot is available

Before dispatching a transcription request, the worker SHALL ensure the call would not exceed the model's RPM or RPD; if it would, the worker SHALL wait until a slot frees rather than calling the provider.

#### Scenario: Per-minute cap reached

- **WHEN** the number of requests for a model in the trailing 60 seconds has reached its RPM
- **THEN** the worker waits until the oldest request ages out of the window before dispatching the next one

#### Scenario: Per-day cap reached

- **WHEN** the number of requests for a model in the trailing 24 hours has reached its RPD
- **THEN** the worker waits until a request ages out of the 24-hour window before dispatching the next one

### Requirement: Durable request ledger

The system SHALL record each transcription request (model and timestamp) in durable storage so rate accounting survives restarts and reflects requests already spent.

#### Scenario: Request recorded on dispatch

- **WHEN** the worker dispatches a transcription request for a model
- **THEN** a request entry with that model and the current timestamp is persisted

#### Scenario: Accounting persists across restart

- **WHEN** the service restarts
- **THEN** rate-limit accounting still counts requests made before the restart that fall within the relevant time windows
