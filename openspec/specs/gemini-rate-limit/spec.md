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

Before dispatching a transcription request, the worker SHALL ensure the call would not exceed the chosen model's RPM or RPD. Rather than blocking on a single model when it is capped, the worker SHALL advance through the configured fallback chain (see `model-fallback`) to the next model with available quota, and SHALL wait only when every chain model is exhausted.

#### Scenario: Capped model is skipped

- **WHEN** a job's preferred chain model has reached its RPM or RPD but another chain model has available quota
- **THEN** the worker dispatches on the available chain model without waiting on the capped one

#### Scenario: Whole chain capped

- **WHEN** every chain model has reached its RPM or RPD
- **THEN** the worker waits until the soonest model's window frees, then dispatches on it

### Requirement: Durable request ledger

The system SHALL record each transcription request (model and timestamp) in durable storage so rate accounting survives restarts and reflects requests already spent.

#### Scenario: Request recorded on dispatch

- **WHEN** the worker dispatches a transcription request for a model
- **THEN** a request entry with that model and the current timestamp is persisted

#### Scenario: Accounting persists across restart

- **WHEN** the service restarts
- **THEN** rate-limit accounting still counts requests made before the restart that fall within the relevant time windows

