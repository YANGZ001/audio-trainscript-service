## REMOVED Requirements

### Requirement: Format button is present in output actions
**Reason**: The transcript output format changed from JSON to plain text, making this capability permanently obsolete. The button was already disabled and its implementation commented out.
**Migration**: No migration needed — the Format button was never active in production.

### Requirement: Format button pretty-prints valid JSON
**Reason**: Same as above — plain-text output cannot be pretty-printed as JSON.
**Migration**: No migration needed.

### Requirement: Format button surfaces parse errors
**Reason**: Same as above.
**Migration**: No migration needed.
