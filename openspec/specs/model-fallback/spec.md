# model-fallback Specification

## Purpose

Defines how the queue worker selects a transcription model. There is no per-job model selection; every job walks an ordered `fallback` chain read from the rate-limit config. The worker uses the first chain model with available quota, skips a capped model (waiting only when the whole chain is capped), and steps down to the next model on a transient provider error. Unknown chain entries are dropped at load so a misconfiguration degrades gracefully. The model that produced a transcript is recorded.

## Requirements
### Requirement: Fallback chain from config

The system SHALL read an ordered fallback chain of model IDs from the rate-limit config file. Every queued transcription job SHALL be processed by walking this chain; there is no per-job model selection.

#### Scenario: Chain order honored

- **WHEN** the config defines a `fallback` chain `[A, B, C]`
- **THEN** a job prefers `A`, then `B`, then `C`, in that order

#### Scenario: All chain models have quota

- **WHEN** every chain model has available quota
- **THEN** the worker uses the first model in the chain

### Requirement: Validate the chain at load

When the rate-limit config is loaded, the system SHALL drop any fallback chain entry that has no corresponding `models` definition (logging a warning naming the dropped entries). If the chain becomes empty, the system SHALL fall back to the default Gemini model so a misconfigured chain degrades gracefully rather than failing every job.

#### Scenario: Unknown chain entry dropped

- **WHEN** the `fallback` chain contains a model ID with no matching `models` entry
- **THEN** that entry is dropped with a warning and the remaining valid entries form the chain

#### Scenario: Chain empty after validation

- **WHEN** every `fallback` entry is unknown and all are dropped
- **THEN** the chain falls back to the default Gemini model

### Requirement: Skip an exhausted model without waiting

Before dispatching, the worker SHALL skip any chain model whose RPM or RPD is already exhausted and advance to the next chain model that has available quota, without waiting.

#### Scenario: Preferred model's quota is spent

- **WHEN** the first chain model has no remaining RPM/RPD but a later chain model does
- **THEN** the worker dispatches on the later model immediately rather than waiting on the first

### Requirement: Wait only when the whole chain is exhausted

If every model in the chain is currently rate-limited, the worker SHALL wait until the soonest model frees a slot rather than failing the job.

#### Scenario: Entire chain capped

- **WHEN** all chain models have exhausted their RPM/RPD
- **THEN** the worker waits until one model's window frees, then dispatches on it

### Requirement: Step down on transient provider error

When an attempt fails with a transient provider error (5xx such as `UNAVAILABLE`), the worker SHALL step down to the next available model in the chain instead of retrying the same model. When the chain is exhausted, the job SHALL be marked `failed`. Permanent errors SHALL fail fast without stepping down.

#### Scenario: Transient error steps down

- **WHEN** a job's current model returns a transient 5xx
- **THEN** the worker retries the job on the next available chain model

#### Scenario: Permanent error does not step down

- **WHEN** a job fails with a permanent error (e.g. invalid URL, missing credentials)
- **THEN** the worker marks the job `failed` immediately without trying another model

### Requirement: Record the model that produced the transcript

The system SHALL record which chain model actually produced a transcript.

#### Scenario: Resolved model recorded

- **WHEN** a job is completed by chain model `B`
- **THEN** the persisted transcript and the worker's completion log reflect model `B`

