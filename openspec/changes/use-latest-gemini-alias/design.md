## Context

The worker walks the ordered `fallback` chain from `config/rate-limits.json`. It uses the first model with local RPM/RPD headroom, steps down on a 5xx, and fails fast on a 4xx. A probe on 2026-10-14 showed:

- `gemini-flash-lite-latest` → served by `gemini-3.5-flash-lite`
- `gemini-2.5-flash` → 404 NOT_FOUND ("no longer available to new users")
- `gemini-3.5-flash` → served by `gemini-3.6-flash` (redirected)
- `gemini-flash-latest` → 503 UNAVAILABLE (high demand)

The Gemini API does not expose which models are free-tier or what their quotas are.

## Goals / Non-Goals

**Goals:**
- Always prefer the newest Flash-Lite model without manual edits.
- Remove the retired model that would fail jobs.

**Non-Goals:**
- Auto-discovering models via `models.list` at boot.
- Recording the concrete resolved `modelVersion` (that would need a TS change).
- Adding `gemini-flash-latest` (it returned 503 under load, and Flash is slower than Flash-Lite for transcription).

## Decisions

- **Alias over pinned IDs.** Google repoints `-latest` aliases on new releases, so this gets "always latest" with zero maintenance. The alternatives were manual pinning (needs ongoing edits) and boot-time discovery (more code, and it still cannot tell which models are free).
- **Conservative quota for the alias (5/20).** The real free-tier limit is unknown. If the local limiter undercounts, we hit provider 429s, which the worker does not step down on. Low limits keep us safe, and `gemini-3.1-flash-lite` absorbs the rest of the volume.
- **Keep pinned fallbacks.** If Google repoints the alias to a model with a tiny or zero free quota, the chain still serves jobs.

## Risks / Trade-offs

- [The alias silently changes model behaviour, e.g. transcript format or filler-word retention] → Pinned fallbacks remain. Spot-check transcripts after Google announces new releases.
- [The recorded model is the alias name, so we can't tell which version produced a transcript] → Accepted for now. A follow-up could log `modelVersion`.
- [The 5/20 quota may be lower than what is actually allowed] → Raise it once the AI Studio rate-limit page confirms the alias's quota.
