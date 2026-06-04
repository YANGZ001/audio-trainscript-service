# Spec: format-json-output

## Purpose

Provides a Format button in the output actions row that pretty-prints valid JSON transcript content in-place, and surfaces a parse error in the status bar when the content is not valid JSON.

## Requirements

### Requirement: Format button is present in output actions
The UI SHALL render a "Format" button in the output actions row alongside the Copy All button.

#### Scenario: Button visible after page load
- **WHEN** the page loads
- **THEN** a "Format" button is visible in the output actions row

#### Scenario: Button disabled with empty textarea
- **WHEN** the transcript textarea is empty
- **THEN** the Format button SHALL be disabled

#### Scenario: Button enabled after transcript arrives
- **WHEN** a transcript has been populated in the textarea
- **THEN** the Format button SHALL be enabled

### Requirement: Format button pretty-prints valid JSON
The system SHALL replace the textarea content with pretty-printed JSON when the content is valid JSON.

#### Scenario: Valid JSON is formatted in-place
- **WHEN** the user clicks Format and the textarea contains valid JSON
- **THEN** the textarea content SHALL be replaced with `JSON.stringify(parsed, null, 2)`

#### Scenario: Already-formatted JSON is idempotent
- **WHEN** the user clicks Format on content that is already pretty-printed JSON
- **THEN** the textarea content SHALL remain valid and equivalent JSON

### Requirement: Format button shows error on invalid JSON
The system SHALL display a parse error in the status bar and leave the textarea unchanged when content is not valid JSON.

#### Scenario: Invalid JSON shows error in status bar
- **WHEN** the user clicks Format and the textarea content is not valid JSON
- **THEN** the status bar SHALL display an error message containing the parse error
- **AND** the textarea content SHALL remain unchanged

#### Scenario: Error message is informative
- **WHEN** a format error occurs
- **THEN** the status bar error text SHALL include the word "format" and the underlying error detail
