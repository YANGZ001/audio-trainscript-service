## MODIFIED Requirements

### Requirement: Format button is present in output actions
The Format button SHALL be present in the HTML but rendered as disabled and visually inactive until the feature is re-enabled.

#### Scenario: Button is present but disabled on page load
- **WHEN** the page loads
- **THEN** the Format button SHALL be present in the output actions row
- **AND** it SHALL be disabled and non-interactive (achieved via HTML comment-out of the onclick handler and forced disabled state)

#### Scenario: Button does not respond to transcript arrival
- **WHEN** a transcript has been populated in the textarea
- **THEN** the Format button SHALL remain disabled
