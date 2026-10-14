## ADDED Requirements

### Requirement: Shipped chain prefers the latest alias

The shipped rate-limit config SHALL place an auto-updating Gemini `-latest` alias at the head of the `fallback` chain, followed by pinned model IDs as fallbacks. The chain SHALL NOT contain model IDs that the provider reports as unavailable (404).

#### Scenario: Alias used first

- **WHEN** the alias has available local quota
- **THEN** the worker dispatches the job on `gemini-flash-lite-latest`

#### Scenario: Alias quota spent

- **WHEN** the alias's local RPM/RPD is exhausted
- **THEN** the worker dispatches on the next pinned chain model (`gemini-3.1-flash-lite`)

#### Scenario: Retired model absent

- **WHEN** the config is loaded
- **THEN** `gemini-2.5-flash` appears in neither `models` nor `fallback`
