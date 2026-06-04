# Proposal: Raw Transcript Passthrough

## Background

The service currently parses Gemini's JSON output into a typed `Segment[]` array before returning it to the caller. This requires a fragile repair pipeline (5 regex passes) to handle the many ways Gemini can produce malformed JSON — missing colons, corrupted keys, MM:SS timestamps, bounding-box leakage, etc. Each new malformation pattern requires a new repair rule.

The root assumption behind this design — that the caller needs structured, machine-validated data — is incorrect. The upstream consumers are either humans reading a transcript or LLMs processing it. Neither requires `JSON.parse()`-valid output.

## Goals

- Remove all JSON parsing and repair logic from `gemini.ts`
- Return Gemini's raw text output directly to the caller via the `done` SSE event
- Eliminate the entire class of JSON parse errors surfaced to the client

## Non-Goals

- Changing the prompt format sent to Gemini (the timestamp-annotated format remains useful context for LLM consumers)
- Adding client-side parsing or display logic
- Supporting new input types or endpoints
- Streaming Gemini output token-by-token (Gemini SDK returns the full response at once)

## Design Principles

- **Delete code, not add**: the repair pipeline goes away entirely; no new abstraction replaces it
- **Passthrough, not transform**: the service relays Gemini's output unchanged
- **Caller owns interpretation**: humans read it, LLMs ingest it — neither needs the service to pre-validate

## Constraints

- SSE protocol and event names must remain backward-compatible for status events (`downloading`, `uploading`, `transcribing`, `error`)
- The `done` event payload type changes — callers depending on `done` as a `Segment[]` will need to update
- Docker-compose build/deploy convention applies; no direct `npm run` commands
