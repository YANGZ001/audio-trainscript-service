## ADDED Requirements

### Requirement: System accepts Xiaoyuzhou episode URLs
The system SHALL detect and route `xiaoyuzhoufm.com/episode/<id>` URLs as the `xiaoyuzhou` source in `detectSource()`.

#### Scenario: Valid Xiaoyuzhou URL is detected
- **WHEN** `POST /api/transcribe` is called with a `url` matching `xiaoyuzhoufm.com/episode/<24-char-hex-id>`
- **THEN** the system SHALL route the request to the Xiaoyuzhou handler without error

#### Scenario: Invalid URL is rejected
- **WHEN** `POST /api/transcribe` is called with a URL that does not match any supported source pattern
- **THEN** the system SHALL return HTTP 400 with an error message listing supported sources including Xiaoyuzhou

### Requirement: Episode ID is extracted from URL
The system SHALL extract the 24-character hexadecimal episode ID from a Xiaoyuzhou episode URL.

#### Scenario: Standard episode URL
- **WHEN** the URL is `https://www.xiaoyuzhoufm.com/episode/69d7b5e4e2c8be3155ccc32b`
- **THEN** the extracted episode ID SHALL be `69d7b5e4e2c8be3155ccc32b`

#### Scenario: URL without recognisable ID throws
- **WHEN** the URL contains `xiaoyuzhoufm.com` but does not contain a 24-char hex episode ID
- **THEN** the system SHALL throw an error with a message indicating the ID could not be extracted

### Requirement: Episode metadata and audio URL are parsed from the public episode page
The system SHALL fetch `https://www.xiaoyuzhoufm.com/episode/<id>` and parse the `__NEXT_DATA__` JSON embedded in the page to obtain the episode's audio URL and metadata. No authentication is required.

#### Scenario: Successful metadata parse
- **WHEN** the episode page is fetched and `__NEXT_DATA__` contains episode data
- **THEN** the system SHALL extract `title`, `ownerName` (podcast title from `episode.podcast.title`), `desc` (description), and `duration` (in seconds) into a `TranscriptMeta` object, and extract the audio URL from `episode.enclosure.url`

#### Scenario: Page does not contain __NEXT_DATA__
- **WHEN** the fetched page HTML does not contain a `<script id="__NEXT_DATA__">` block
- **THEN** the system SHALL throw an error indicating the episode data could not be parsed

#### Scenario: Episode has no accessible audio URL
- **WHEN** `episode.enclosure.url` is absent or empty (e.g. private/paid episode)
- **THEN** the system SHALL throw an error indicating no audio URL is available for this episode

### Requirement: Xiaoyuzhou audio is downloaded as M4A
The system SHALL download the episode audio to `/data/xiaoyuzhou-audio/<episodeId>.m4a` using the URL obtained from the page parse, enforcing a 500 MB size limit.

#### Scenario: Successful download emits progress events
- **WHEN** a Xiaoyuzhou episode is not cached and the download begins
- **THEN** the system SHALL emit `downloading` SSE events with a `progress` percentage as bytes are received

#### Scenario: File exceeds size limit
- **WHEN** the downloaded audio exceeds 500 MB
- **THEN** the system SHALL abort the download, delete the partial file, and emit an `error` SSE event

### Requirement: Xiaoyuzhou transcription follows the standard SSE flow
The system SHALL emit the standard `downloading → uploading → transcribing → done` SSE event sequence for Xiaoyuzhou episode transcription.

#### Scenario: Full transcription golden path
- **WHEN** a valid Xiaoyuzhou URL is submitted and all steps succeed
- **THEN** the system SHALL emit `downloading` (if not cached), `uploading`, `transcribing`, and finally `done` with `{ text: <transcript> }`

#### Scenario: Any step fails
- **WHEN** any step (page fetch, parse, download, upload, transcription) throws an error
- **THEN** the system SHALL emit an `error` SSE event with the error message and terminate the response
