## ADDED Requirements

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
