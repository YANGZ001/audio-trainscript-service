# Context: Raw Transcript Passthrough

## Decision Log

### 2026-06-01 — Feature initiated

**Trigger**: Live failure — Gemini returned `{"=420.734,"to":423.164,...}` (corrupted `"from":` key) causing `JSON.parse` to throw at position 14322 in a 23,701-char response. This is the fifth repair rule added to patch Gemini's non-deterministic output format.

**Decision**: Remove JSON parsing from the service entirely rather than continue accumulating repair rules.

**Rationale**: The upstream consumers are humans or LLMs. Neither requires `JSON.parse()`-valid data from the service. The repair pipeline is an ongoing maintenance burden with no end — each new Gemini model version or response length can introduce new malformation patterns. Passthrough eliminates the class of failures entirely.

**Rejected alternatives**:
- Gemini `responseSchema` (constrained decoding): would fix the parse problem but adds model-version dependency; some Gemini lite variants do not support it.
- `jsonrepair` library: replaces regex repairs with a more robust library, but the service still owns JSON parsing and is still a failure point for sufficiently malformed responses.

**Scope note**: The Gemini prompt format (JSON-ish with timestamps) is intentionally kept unchanged. Timestamps remain useful context for LLM consumers even when the output is not parse-valid JSON.

## Open Questions

- None at this time.

## Blockers

- None at this time.
