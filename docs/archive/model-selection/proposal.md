# Model Selection — Proposal

## Background

The Gemini model used for transcription is hardcoded as `gemini-3.1-flash-lite` in `src/services/gemini.ts`. As Google releases newer and more capable models, users have no way to try them without restarting the service with a code change. Different use cases may also warrant different models — a quick draft transcription may use a lighter model, while a critical recording may benefit from a more capable one.

## Goals

1. Allow callers to specify a Gemini model per request via an optional `?model=` query parameter.
2. Default to `gemini-3.1-flash-lite` when no model is specified (no behaviour change for existing callers).
3. Expose the model selection in the shell client scripts via a `MODEL` environment variable.

## Non-Goals

- A server-side model allowlist or validation (invalid names are rejected by the Gemini API and surface as the existing SSE `error` event).
- A UI for model selection.
- Persisting model preference across requests.

## Design Principles

- **Zero breaking change**: existing callers omitting the parameter get identical behaviour.
- **Minimal surface area**: one query param, one env var — nothing more.

## Constraints

- Model availability is governed by the caller's Gemini API key and quota.
- The service does not verify that a given model supports audio transcription; that is the caller's responsibility.
