## MODIFIED Requirements

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
