# transcript-reader Specification

## Purpose

Defines the in-app reader for saved transcripts, including copying and exporting the full text.

## Requirements
### Requirement: Read saved transcripts
The UI SHALL open a saved transcript by clicking its history title, displaying its title, author, plain-text body, and loading/error feedback in a keyboard-accessible dialog. Closing or changing the reader SHALL prevent stale requests from updating the displayed result.

#### Scenario: Open and close a transcript
- **WHEN** a user activates a history title
- **THEN** its saved transcript is fetched and displayed, and the dialog can be closed with its close button or Escape

#### Scenario: Loading fails
- **WHEN** the transcript request fails
- **THEN** an error and retry action appear and copy/download remain unavailable

### Requirement: Copy and export a transcript
The reader SHALL offer full-text copy and UTF-8 TXT/Markdown downloads named from the selected title, without modifying the saved transcript.

#### Scenario: Export an opened transcript
- **WHEN** a loaded reader's TXT or Markdown download is activated
- **THEN** the browser downloads the full text with the selected extension

#### Scenario: Copy permission fails
- **WHEN** both clipboard write and the fallback fail
- **THEN** the reader shows a visible error
