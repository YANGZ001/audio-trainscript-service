## ADDED Requirements

### Requirement: Transcript output is plain text with per-turn timestamps and speaker labels
The system SHALL produce a verbatim plain-text transcript where each speaker turn is prefixed with a `[MM:SS]` timestamp and the speaker's name or role.

#### Scenario: Single-speaker output uses speaker label
- **WHEN** the audio contains one speaker
- **THEN** each turn SHALL be formatted as `[MM:SS] <SpeakerName>: <spoken text>`

#### Scenario: Multi-speaker output labels each turn
- **WHEN** the audio contains multiple speakers
- **THEN** each turn SHALL be labelled with the respective speaker's name or role

#### Scenario: Filler words are preserved verbatim
- **WHEN** the audio contains filler words (um, uh, 嗯, 啊, 那个, etc.)
- **THEN** those words SHALL appear in the transcript exactly as spoken and SHALL NOT be removed or paraphrased

#### Scenario: Unintelligible audio is marked
- **WHEN** a word or segment is inaudible
- **THEN** the transcript SHALL contain `[inaudible]` at that position

#### Scenario: Low-confidence words are marked
- **WHEN** a word is transcribed with low confidence
- **THEN** the transcript SHALL contain `[unclear: <word>?]` at that position

#### Scenario: Response is plain text, not JSON
- **WHEN** the transcription API call completes
- **THEN** the response body SHALL be a plain-text string with no JSON wrapping
