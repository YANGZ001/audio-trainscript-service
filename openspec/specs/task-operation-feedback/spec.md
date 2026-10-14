# task-operation-feedback Specification

## Purpose

Defines user-visible feedback for queued transcription tasks: explicit completion notices, reliable task mutations, and surfaced polling errors.

## Requirements
### Requirement: Explicit completion feedback
The jobs API SHALL support optional inclusion of retained completed jobs without changing the default active-only response. The UI SHALL show a completion link and highlight the saved history result for explicitly completed tracked jobs, but SHALL NOT treat disappearance alone as success.

#### Scenario: Tracked job completes
- **WHEN** a submitted or observed active job becomes done with a transcription id
- **THEN** history refreshes and a completion notice offers access to that result

#### Scenario: Job is cancelled elsewhere
- **WHEN** a tracked job disappears without an explicit done state
- **THEN** the UI refreshes history without a completion notice

### Requirement: Reliable task mutations
The UI SHALL check HTTP responses for cancellation, dismissal and retry, show errors, and restore usable controls. Failed retry submission SHALL NOT delete the original job. If submission succeeds but cleanup fails, the UI SHALL report partial success and offer cleanup without submitting duplicate retries.

#### Scenario: Retry rejected
- **WHEN** retry submission returns an error
- **THEN** the original failed job remains and the error is displayed

#### Scenario: Retry accepted but dismissal fails
- **WHEN** retry submission succeeds and deleting the original fails
- **THEN** polling continues, partial success is reported, and subsequent cleanup does not enqueue another job

### Requirement: Visible polling errors
The UI SHALL show queue refresh errors and retry polling without overlapping requests. Routine polling SHALL NOT clear mutation errors.

#### Scenario: Temporary polling outage
- **WHEN** fetching jobs fails
- **THEN** the last queue stays visible with a refresh error and subsequent successful polling clears only that refresh error
