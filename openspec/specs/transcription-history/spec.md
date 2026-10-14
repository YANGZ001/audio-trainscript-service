# transcription-history Specification

## Purpose

Defines persistent transcription history. Completed URL transcriptions are stored in a SQLite database (WAL journal) and exposed through a list/delete API and a History UI with copy and delete actions. File uploads are not persisted. History survives service restarts.

## Requirements
### Requirement: Transcription persistence
The system SHALL automatically persist completed URL-based transcriptions (Bilibili, Snipd, and Xiaoyuzhou) to a SQLite database after each successful transcription, keyed by normalized content id. Persistence SHALL be an upsert on `(source_type, content_id)`: the first transcription of a given content inserts a row; a subsequent transcription of the same content SHALL replace that row's transcript, metadata, model, and `created_at` rather than insert a duplicate. The `content_id` is the stable identifier already derived during download (`bvid` for Bilibili, episode UUID for Snipd, 24-char episode id for Xiaoyuzhou), not the raw submitted URL. Uploaded `.m4a` transcriptions SHALL NOT be persisted.

#### Scenario: First Bilibili transcription is saved
- **WHEN** a Bilibili URL transcription completes successfully for a `bvid` not yet in the table
- **THEN** a row is inserted into the `transcriptions` table with `source_type='bilibili'`, `content_id=<bvid>`, the original submitted URL, title, owner name, duration, transcript text, model, and ISO-8601 UTC `created_at`

#### Scenario: First Snipd transcription is saved
- **WHEN** a Snipd URL transcription completes successfully for an episode UUID not yet in the table
- **THEN** a row is inserted with `source_type='snipd'`, `content_id=<uuid>`, and the same metadata fields

#### Scenario: First Xiaoyuzhou transcription is saved
- **WHEN** a Xiaoyuzhou URL transcription completes successfully for an episode id not yet in the table
- **THEN** a row is inserted with `source_type='xiaoyuzhou'`, `content_id=<episode id>`, and the same metadata fields

#### Scenario: Re-transcription replaces the existing row
- **WHEN** a URL transcription completes successfully for a `(source_type, content_id)` that already has a row
- **THEN** the existing row is updated in place with the new transcript, metadata, model, submitted URL, and `created_at`, and no second row is created

#### Scenario: Same content via a different URL form does not duplicate
- **WHEN** the same Bilibili video is submitted once as a `b23.tv` short link and once as a full `bilibili.com` URL (resolving to the same `bvid`)
- **THEN** only one row exists for that `bvid` after both transcriptions complete

#### Scenario: Upload transcription is not saved
- **WHEN** a `.m4a` file upload transcription completes successfully
- **THEN** no row is inserted into the `transcriptions` table

#### Scenario: DB write failure does not break SSE response
- **WHEN** the database upsert fails (e.g., disk full, lock error)
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

### Requirement: Delete from history UI
The system SHALL allow users to delete a history entry from the UI.

#### Scenario: Delete removes row from UI and DB
- **WHEN** the user clicks the Delete button on a history row
- **THEN** `DELETE /api/transcriptions/:id` is called and the row is removed from the displayed table on success


### Requirement: Search and filter history
The history UI SHALL support case-insensitive title/author search combined with a source filter, show matching/total counts, preserve filters on refresh, and distinguish empty history from no matches.

#### Scenario: Combined filtering
- **WHEN** a user searches for an author and selects a source
- **THEN** only rows matching both criteria are displayed

#### Scenario: No matching history
- **WHEN** existing history contains no row matching the filters
- **THEN** a no-matches message and zero matching count appear

### Requirement: Visible history operation feedback
History load and deletion failures SHALL display a visible error. Failed loads SHALL preserve already displayed rows and offer refresh. Successful deletion SHALL remove the row and invalidate cached text.

#### Scenario: History refresh fails
- **WHEN** a history request fails after prior results were loaded
- **THEN** the results stay displayed with an error and refresh action

#### Scenario: Delete rejected
- **WHEN** deleting a history row returns an error
- **THEN** the row remains, its delete control is usable again, and an error is shown

### Requirement: Single copy entry point
The history list SHALL open the transcript reader via its title and SHALL NOT display a separate transcript copy button. Full-text copying SHALL remain available in the reader.

#### Scenario: Copy from reader
- **WHEN** the user wants to copy a saved transcript
- **THEN** they open its title and use the reader copy action; the list only retains its delete action
