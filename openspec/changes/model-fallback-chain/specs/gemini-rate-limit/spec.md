## MODIFIED Requirements

### Requirement: Worker blocks until a request slot is available

Before dispatching a transcription request, the worker SHALL ensure the call would not exceed the chosen model's RPM or RPD. Rather than blocking on a single model when it is capped, the worker SHALL advance through the configured fallback chain (see `model-fallback`) to the next model with available quota, and SHALL wait only when every chain model is exhausted.

#### Scenario: Capped model is skipped

- **WHEN** a job's preferred chain model has reached its RPM or RPD but another chain model has available quota
- **THEN** the worker dispatches on the available chain model without waiting on the capped one

#### Scenario: Whole chain capped

- **WHEN** every chain model has reached its RPM or RPD
- **THEN** the worker waits until the soonest model's window frees, then dispatches on it
