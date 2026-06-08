# Spec: bilibili-speaker-label

## Purpose

TBD — capability added by the redesign-transcription-prompt change.

## Requirements

### Requirement: Bilibili video owner name is used as the primary speaker label
The system SHALL extract the video owner's name from the Bilibili API response and inject it into the transcription prompt as the primary speaker label.

#### Scenario: Owner name injected into prompt
- **WHEN** a Bilibili video URL is submitted for transcription
- **THEN** the transcription prompt SHALL include the owner's name as the identified primary speaker

#### Scenario: Owner name appears in transcript output
- **WHEN** the transcription completes for a Bilibili video
- **THEN** speaker turns attributed to the video owner SHALL use the owner's name rather than a generic label such as "Speaker A"

#### Scenario: Fallback when owner name is unavailable
- **WHEN** the Bilibili API does not return an owner name, or a non-Bilibili URL is used
- **THEN** the primary speaker SHALL be labelled "Speaker A"

### Requirement: getVideoMetadata returns cid and enriched context fields from a single API call
The Bilibili service SHALL expose a `getVideoMetadata()` function that returns the content ID and all fields needed for Gemini context from a single call to `/x/web-interface/view`.

#### Scenario: Metadata extracted from API response
- **WHEN** `getVideoMetadata()` is called with a valid BVID
- **THEN** it SHALL return an object containing: `cid` (number), `ownerName` (string), `title` (string), `desc` (string), `tname` (string), `duration` (number), and `dynamic` (string)

#### Scenario: No extra HTTP request for metadata
- **WHEN** `getVideoMetadata()` fetches video metadata
- **THEN** only one HTTP request to `/x/web-interface/view` SHALL be made

### Requirement: Video metadata is passed as context to the transcription prompt
The system SHALL inject the video title, channel name, and description as a context block into the Gemini transcription prompt.

#### Scenario: Context block present in prompt
- **WHEN** a transcription request is made with available metadata
- **THEN** the prompt SHALL include a "Video context" section with title, channel, and description before the transcription instructions

#### Scenario: Context improves technical term accuracy
- **WHEN** the video title or description contains domain-specific terms
- **THEN** those terms SHALL appear correctly spelled in the transcript output
