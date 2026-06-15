## ADDED Requirements

### Requirement: Transcription persistence
The system SHALL automatically persist completed URL-based transcriptions (Bilibili and Snipd) to a SQLite database after each successful transcription. Uploaded .m4a transcriptions SHALL NOT be persisted.

#### Scenario: Bilibili transcription is saved
- **WHEN** a Bilibili URL transcription completes successfully
- **THEN** a row is inserted into the `transcriptions` table with `source_type='bilibili'`, the original submitted URL, title, owner name, duration, transcript text, and ISO-8601 UTC `created_at`

#### Scenario: Snipd transcription is saved
- **WHEN** a Snipd URL transcription completes successfully
- **THEN** a row is inserted into the `transcriptions` table with `source_type='snipd'` and the same metadata fields

#### Scenario: Upload transcription is not saved
- **WHEN** a `.m4a` file upload transcription completes successfully
- **THEN** no row is inserted into the `transcriptions` table

#### Scenario: DB write failure does not break SSE response
- **WHEN** the database insert fails (e.g., disk full, lock error)
- **THEN** the SSE `done` event is still delivered to the client and the error is logged as a warning

#### Scenario: Persistence survives container restart
- **WHEN** the Docker container is stopped and restarted
- **THEN** previously persisted transcriptions are still returned by `GET /api/transcriptions`

### Requirement: List transcriptions API
The system SHALL expose `GET /api/transcriptions` returning all persisted transcriptions ordered newest first.

#### Scenario: Returns all rows newest first
- **WHEN** `GET /api/transcriptions` is called
- **THEN** the response is a JSON array of transcription objects ordered by `created_at` descending

#### Scenario: Returns empty array when no transcriptions exist
- **WHEN** `GET /api/transcriptions` is called with no rows in the database
- **THEN** the response is an empty JSON array `[]` with HTTP 200

### Requirement: Delete transcription API
The system SHALL expose `DELETE /api/transcriptions/:id` to hard-delete a single row.

#### Scenario: Delete existing row
- **WHEN** `DELETE /api/transcriptions/5` is called for an existing row
- **THEN** the row is removed from the database and HTTP 204 is returned

#### Scenario: Delete with invalid id
- **WHEN** `DELETE /api/transcriptions/abc` is called with a non-integer id
- **THEN** HTTP 400 is returned with an error message

### Requirement: History UI
The system SHALL render a history table below the transcription form in `public/index.html`, visible to any user without authentication.

#### Scenario: History table renders on page load
- **WHEN** the page loads
- **THEN** `GET /api/transcriptions` is fetched and a table of past transcriptions is displayed below the form, showing title, source type, date, and duration per row

#### Scenario: History updates after new transcription
- **WHEN** a URL-based transcription completes (SSE `done` received)
- **THEN** the history table refreshes to include the new row without a full page reload

#### Scenario: Empty history state
- **WHEN** there are no persisted transcriptions
- **THEN** the history section displays an "No transcriptions yet." message

### Requirement: Redo from history
The system SHALL allow users to re-transcribe any URL-based history entry, creating a new row.

#### Scenario: Redo pre-fills URL and submits
- **WHEN** the user clicks the Redo button on a history row
- **THEN** the URL tab is activated, the URL input is pre-filled with the row's `source_url`, and transcription starts automatically

#### Scenario: Redo creates new row, preserves original
- **WHEN** a redo transcription completes
- **THEN** a new row is inserted into the database and the original row remains unchanged

### Requirement: Delete from history UI
The system SHALL allow users to delete a history entry from the UI.

#### Scenario: Delete removes row from UI and DB
- **WHEN** the user clicks the Delete button on a history row
- **THEN** `DELETE /api/transcriptions/:id` is called and the row is removed from the displayed table on success
