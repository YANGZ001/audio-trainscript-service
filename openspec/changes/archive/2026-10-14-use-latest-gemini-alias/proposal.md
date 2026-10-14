## Why

The fallback chain is pinned to older models (`gemini-3.1-flash-lite` first), so the service never picks up newer free Flash-Lite releases unless someone edits the config by hand. It also still lists `gemini-2.5-flash`, which now returns 404 "no longer available to new users". The worker treats that as a permanent error, so any job that reaches it fails instead of degrading.

## What Changes

- Put the auto-updating alias `gemini-flash-lite-latest` (currently resolves to `gemini-3.5-flash-lite`) at the head of the `fallback` chain in `config/rate-limits.json`, so new Flash-Lite releases are used without config or code changes.
- Add a `models` entry for the alias with the conservative default quota (`rpm: 5, rpd: 20`), because its free-tier quota is not yet known. When that is spent, the worker steps down to `gemini-3.1-flash-lite` (15/500).
- Keep the pinned models `gemini-3.1-flash-lite`, `gemini-2.5-flash-lite` and `gemini-3.5-flash` as fallbacks.
- Remove `gemini-2.5-flash` from both `models` and `fallback`.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `model-fallback`: the shipped chain SHALL start with an auto-updating "latest" alias and SHALL NOT contain model IDs the provider has retired.

## Impact

- `config/rate-limits.json` only. No TypeScript changes.
- Transcripts produced by the alias are recorded with model `gemini-flash-lite-latest`, not the concrete version it resolved to.
- Output may change silently when Google repoints the alias.
